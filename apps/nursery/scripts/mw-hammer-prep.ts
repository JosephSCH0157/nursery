import type { IncomingMessage, ServerResponse } from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@forge/tongs";
import {
  AI_USAGE_FEATURE,
  AI_USAGE_LANE,
  AI_USAGE_STATUS,
  AI_USAGE_SUBFEATURE,
  AI_USAGE_TRIGGER,
} from "../../../packages/tongs/src/ai-usage-taxonomy";
import {
  createHammerAudioPolishRequestContext,
  handleHammerAudioPolishRequest,
} from "./hammer-audio-polish";
import {
  HAMMER_AUDIO_POLISH_ROUTE,
  HAMMER_AUDIO_POLISH_STATUS_ROUTE,
  type HammerAudioPolishPhase,
} from "../../hammer/src/prep/hammerAudioPolishApi";
import { HAMMER_STUDIO_RACK_RENDER_ROUTE } from "../../hammer/src/editor/hammerStudioRackRenderApi";
import {
  createHammerStudioRackRenderRequestContext,
  handleHammerStudioRackRenderRequest,
} from "./hammer-studio-rack-render";
import {
  HAMMER_TRANSCRIPT_PREP_ROUTE,
  type HammerTranscriptPrepRequest,
  type HammerTranscriptPrepSegment,
} from "../../hammer/src/prep/hammerPrepApi";
import { HAMMER_TRANSCRIPT_CLEANUP_ASSIST_ROUTE } from "../../hammer/src/editor/hammerTranscriptCleanupAssistApi";
import { HAMMER_VISUAL_ASSIST_PREFLIGHT_ROUTE } from "../../hammer/src/lib/hammerVisualAssistApi";
import { resolveHearthRuntimeConfig } from "../server/hearth/hearth-runtime-config";
import {
  buildTranscriptionAccounting,
  recordAiUsageEvent,
  type BillingMode,
} from "../server/ai-usage-accounting";
import {
  AI_REASON_CODES,
  getAiReasonMessage,
  type AiDecisionType,
  type AiReasonCode,
} from "@forge/tongs/ai-policy";
import { QUENCH_METADATA_ASSIST_ROUTE } from "../../quench/src/core/quenchMetadataAssist.contract";

type Next = (err?: unknown) => void;

const DEFAULT_TRANSCRIBE_MODEL = "gpt-4o-transcribe-diarize";
const ALLOWED_MEDIA_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".wav", ".mp3", ".m4a"]);
const MAX_TRANSCRIBE_SOURCE_BYTES = 96 * 1024 * 1024;
const CANONICAL_MEDIA_FETCH_TIMEOUT_MS = 60_000;
const OPENAI_TRANSCRIBE_TIMEOUT_MS = 4 * 60 * 1000;
const OPENAI_CLEANUP_TIMEOUT_MS = 90_000;
const MEDIA_CONTENT_TYPES: Partial<Record<string, string>> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
};

type HammerAudioPolishProgressRecord = {
  workspaceId: string;
  workpieceId: string;
  status: "running" | "prepared" | "failed";
  phase: HammerAudioPolishPhase | null;
  failedPhase: HammerAudioPolishPhase | null;
  errorMessage: string | null;
  updatedAt: string;
};

const hammerAudioPolishProgressByKey = new Map<string, HammerAudioPolishProgressRecord>();

function buildAudioPolishProgressKey(workspaceId: string, workpieceId: string): string {
  return `${workspaceId}:${workpieceId}`;
}

type NormalizedLocalRequest = HammerTranscriptPrepRequest & {
  local_root_abs: string;
  local_relpath: string;
};

type NormalizedCanonicalWorkpieceRequest = Omit<
  HammerTranscriptPrepRequest,
  "local_root_abs" | "local_relpath" | "canonical_workpiece_path"
> & {
  canonical_workpiece_path: string;
};

type AiPolicyResolveRow = {
  decision_type?: unknown;
  reason_code?: unknown;
};

type CleanupAssistSegment = {
  segment_id: string;
  start_sec: number;
  end_sec: number;
  speaker: string;
  text: string;
  is_disabled?: boolean;
  gain_db?: number;
};

type CleanupAssistRequest = {
  workspace_id: string;
  workpiece_id: string;
  segments: CleanupAssistSegment[];
  segment_ids: string[];
};

type QuenchMetadataAssistRequest = {
  workspace_id: string;
  workpiece_id: string;
  title: string;
  description: string;
  tags: string[];
};

const AI_POLICY_REASON_CODE_SET = new Set<string>(AI_REASON_CODES);

function readTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function isSafeRelpath(value: string): boolean {
  const normalized = value.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length > 0 && parts.every((part) => part !== "." && part !== "..");
}

function resolveMediaFileAbs(localRootAbs: string, localRelpath: string): string | null {
  if (!isSafeRelpath(localRelpath)) {
    return null;
  }

  const rootAbs = path.resolve(localRootAbs);
  const absolutePath = path.resolve(rootAbs, ...localRelpath.replace(/\\/g, "/").split("/").filter(Boolean));
  const relative = path.relative(rootAbs, absolutePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  return absolutePath;
}

function inferContentType(absolutePath: string, mimeType?: string | null): string {
  const explicit = readTrimmed(mimeType);
  if (explicit) return explicit;
  const extension = path.extname(absolutePath).toLowerCase();
  return MEDIA_CONTENT_TYPES[extension] ?? "application/octet-stream";
}

function formatBytesAsMiB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function buildSourceTooLargeMessage(byteCount: number): string {
  return `Hammer transcript prep currently supports source media up to ${formatBytesAsMiB(MAX_TRANSCRIBE_SOURCE_BYTES)} in this runtime. Received ${formatBytesAsMiB(byteCount)}.`;
}

function readHeaderNumber(headers: Headers, name: string): number | null {
  const value = readTrimmed(headers.get(name));
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readHeaderString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return readTrimmed(value[0]);
  return readTrimmed(value);
}

function readBearerToken(value: string | null): string | null {
  const normalized = readTrimmed(value);
  if (!normalized) return null;
  if (/^bearer\s+/i.test(normalized)) {
    const token = normalized.replace(/^bearer\s+/i, "").trim();
    return token || null;
  }
  return normalized;
}

function readForgeUserAccessToken(req: IncomingMessage): string | null {
  const explicitToken = readHeaderString(req.headers["x-forge-user-token"]);
  if (explicitToken) {
    return readBearerToken(explicitToken);
  }
  const forgeAuth = readHeaderString(req.headers["x-forge-user-authorization"]);
  if (forgeAuth) {
    return readBearerToken(forgeAuth);
  }
  return null;
}

function buildSupabaseRpcHeaders(args: {
  rpcKey: string;
  userAccessToken: string;
}): Headers {
  const headers = new Headers();
  headers.set("apikey", args.rpcKey);
  headers.set("authorization", `Bearer ${args.userAccessToken}`);
  headers.set("accept-profile", "tongs");
  headers.set("content-profile", "tongs");
  headers.set("content-type", "application/json");
  return headers;
}

function readAiPolicyDecisionType(value: unknown): AiDecisionType | null {
  return value === "ALLOW" || value === "SOFT_DENY" || value === "HARD_DENY"
    ? value
    : null;
}

function readAiPolicyReasonCode(value: unknown): AiReasonCode | null {
  return typeof value === "string" && AI_POLICY_REASON_CODE_SET.has(value)
    ? (value as AiReasonCode)
    : null;
}

function createTimeoutAbortController(timeoutMs: number): {
  controller: AbortController;
  dispose: () => void;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return {
    controller,
    dispose: () => clearTimeout(timeoutId),
  };
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(body);
}

function normalizeRequest(body: unknown): NormalizedLocalRequest | NormalizedCanonicalWorkpieceRequest | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const row = body as Record<string, unknown>;
  const workspaceId = readTrimmed(row.workspace_id);
  const workpieceId = readTrimmed(row.workpiece_id);
  const localRootAbs = readTrimmed(row.local_root_abs);
  const localRelpath = readTrimmed(row.local_relpath);
  const canonicalWorkpiecePath = readTrimmed(row.canonical_workpiece_path);
  const mediaKind = readTrimmed(row.media_kind);
  if (!workspaceId || !workpieceId || !mediaKind) {
    return null;
  }

  if (localRootAbs && localRelpath) {
    return {
      workspace_id: workspaceId,
      workpiece_id: workpieceId,
      media_kind: mediaKind as HammerTranscriptPrepRequest["media_kind"],
      local_root_abs: localRootAbs,
      local_relpath: localRelpath,
      mime_type: readTrimmed(row.mime_type),
    };
  }

  if (!canonicalWorkpiecePath) {
    return null;
  }

  return {
    workspace_id: workspaceId,
    workpiece_id: workpieceId,
    media_kind: mediaKind as HammerTranscriptPrepRequest["media_kind"],
    canonical_workpiece_path: canonicalWorkpiecePath,
    mime_type: readTrimmed(row.mime_type),
  };
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", resolve);
    req.on("error", reject);
  });

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return null;
  return JSON.parse(raw) as unknown;
}

function readUpstreamErrorMessage(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object") return trimmed;
    const row = parsed as Record<string, unknown>;
    const error = row.error;
    if (error && typeof error === "object" && !Array.isArray(error)) {
      return readTrimmed((error as Record<string, unknown>).message) ?? trimmed;
    }
    return readTrimmed(row.message) ?? trimmed;
  } catch {
    return trimmed;
  }
}

function buildRequestOrigin(req: IncomingMessage): string {
  const forwardedProtoHeader = req.headers["x-forwarded-proto"];
  const forwardedProto = Array.isArray(forwardedProtoHeader)
    ? readTrimmed(forwardedProtoHeader[0])
    : readTrimmed(forwardedProtoHeader);
  const hostHeader = req.headers.host;
  const host = Array.isArray(hostHeader)
    ? readTrimmed(hostHeader[0])
    : readTrimmed(hostHeader);
  return `${forwardedProto ?? "http"}://${host ?? "localhost"}`;
}

function readJsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readErrorMessage(payload: unknown, fallback: string): string {
  const row = readJsonObject(payload);
  const error = readJsonObject(row?.error);
  return readTrimmed(error?.message)
    ?? readTrimmed(row?.message)
    ?? readTrimmed(row?.detail)
    ?? fallback;
}

function readChatMessageContent(value: unknown): string | null {
  if (typeof value === "string") return readTrimmed(value);
  if (!Array.isArray(value)) return null;
  const parts: string[] = [];
  for (const item of value) {
    const row = readJsonObject(item);
    const text = readTrimmed(row?.text);
    if (text) parts.push(text);
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

function normalizeCleanupAssistRequest(body: unknown): CleanupAssistRequest | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const row = body as Record<string, unknown>;
  const workspaceId = readTrimmed(row.workspace_id);
  const workpieceId = readTrimmed(row.workpiece_id);
  const segmentsRaw = Array.isArray(row.segments) ? row.segments : [];
  const segmentIdsRaw = Array.isArray(row.segment_ids) ? row.segment_ids : [];
  if (!workspaceId || !workpieceId || segmentsRaw.length === 0 || segmentIdsRaw.length === 0) {
    return null;
  }

  const segments = segmentsRaw
    .map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      const segment = value as Record<string, unknown>;
      const segmentId = readTrimmed(segment.segment_id);
      const startSec = readNumber(segment.start_sec);
      const endSec = readNumber(segment.end_sec);
      const speaker = readTrimmed(segment.speaker);
      const text = readTrimmed(segment.text);
      if (!segmentId || startSec == null || endSec == null || endSec <= startSec || !speaker || !text) {
        return null;
      }
      return {
        segment_id: segmentId,
        start_sec: startSec,
        end_sec: endSec,
        speaker,
        text,
        ...(typeof segment.is_disabled === "boolean" ? { is_disabled: segment.is_disabled } : {}),
        ...(typeof segment.gain_db === "number" && Number.isFinite(segment.gain_db)
          ? { gain_db: segment.gain_db }
          : {}),
      } satisfies CleanupAssistSegment;
    })
    .filter((value): value is CleanupAssistSegment => Boolean(value));

  if (segments.length === 0) return null;
  const knownIds = new Set(segments.map((segment) => segment.segment_id));
  const segmentIds = segmentIdsRaw
    .map((value) => readTrimmed(value))
    .filter((value): value is string => Boolean(value))
    .filter((value) => knownIds.has(value));
  if (segmentIds.length === 0) return null;

  return {
    workspace_id: workspaceId,
    workpiece_id: workpieceId,
    segments,
    segment_ids: Array.from(new Set(segmentIds)),
  };
}

function normalizeQuenchMetadataAssistRequest(body: unknown): QuenchMetadataAssistRequest | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const row = body as Record<string, unknown>;
  const workspaceId = readTrimmed(row.workspace_id);
  const workpieceId = readTrimmed(row.workpiece_id);
  const title = readTrimmed(row.title);
  const description = readTrimmed(row.description);
  const tagsRaw = Array.isArray(row.tags) ? row.tags : [];
  const tags = Array.from(new Set(
    tagsRaw
      .map((value) => readTrimmed(value))
      .filter((value): value is string => Boolean(value))
      .slice(0, 12),
  ));
  if (!workspaceId || !workpieceId || !title || !description) {
    return null;
  }
  return {
    workspace_id: workspaceId,
    workpiece_id: workpieceId,
    title,
    description,
    tags,
  };
}

function toHammerPreflightErrorMessage(
  reasonCode: AiReasonCode | null,
  decisionType: AiDecisionType,
): string {
  const base = reasonCode ? getAiReasonMessage(reasonCode) : "AI action blocked by policy.";
  if (decisionType === "SOFT_DENY") {
    return `${base} Configure a personal AI connection and retry.`;
  }
  return base;
}

function toQuenchPreflightErrorMessage(
  reasonCode: AiReasonCode | null,
  decisionType: AiDecisionType,
): string {
  const base = reasonCode ? getAiReasonMessage(reasonCode) : "AI action blocked by policy.";
  if (decisionType === "SOFT_DENY") {
    return `${base} Configure a personal AI connection and retry.`;
  }
  return base;
}

async function resolveUserIdFromAccessToken(args: {
  supabaseUrl: string;
  rpcKey: string;
  userAccessToken: string;
}): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch(`${args.supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: args.rpcKey,
        authorization: `Bearer ${args.userAccessToken}`,
      },
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  const payload = await response.json().catch(() => null);
  return readTrimmed(readJsonObject(payload)?.id);
}

async function resolveOrgIdForWorkspace(args: {
  supabaseUrl: string;
  rpcKey: string;
  userAccessToken: string;
  workspaceId: string;
}): Promise<string | null> {
  const headers = buildSupabaseRpcHeaders({
    rpcKey: args.rpcKey,
    userAccessToken: args.userAccessToken,
  });
  let response: Response;
  try {
    response = await fetch(
      `${args.supabaseUrl}/rest/v1/workspaces?id=eq.${encodeURIComponent(args.workspaceId)}&select=org_id`,
      {
        method: "GET",
        headers,
      },
    );
  } catch {
    return null;
  }

  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  if (!Array.isArray(payload) || payload.length === 0) return null;
  const row = readJsonObject(payload[0]);
  return readTrimmed(row?.org_id);
}

async function runHammerTranscriptPolicyPreflight(args: {
  supabaseUrl: string;
  rpcKey: string;
  userAccessToken: string;
  workspaceId: string;
  action: "chat" | "stt";
  feature: "research_flows" | "heavy_tasks";
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const userId = await resolveUserIdFromAccessToken(args);
  if (!userId) {
    return {
      ok: false,
      status: 401,
      error: "Sign in required before Hammer AI policy preflight can run.",
    };
  }

  const orgId = await resolveOrgIdForWorkspace(args);
  const headers = buildSupabaseRpcHeaders({
    rpcKey: args.rpcKey,
    userAccessToken: args.userAccessToken,
  });

  let response: Response;
  try {
    response = await fetch(`${args.supabaseUrl}/rest/v1/rpc/resolve_ai_policy`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        p_org_id: orgId,
        p_workspace_id: args.workspaceId,
        p_user_id: userId,
        p_tool: "hammer",
        p_feature: args.feature,
        p_action: args.action,
        p_requested_mode: "ORG_FIRST_PERSONAL_FALLBACK",
        p_personal_ai_configured: false,
        p_org_ai_available: true,
        p_requested_funding_source: "org_shared_credits",
        p_write_ledger: true,
      }),
    });
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: `AI policy preflight failed: ${error instanceof Error ? error.message : "Network error"}`,
    };
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: readErrorMessage(payload, `AI policy preflight failed (${response.status}).`),
    };
  }

  const row = Array.isArray(payload) ? (payload[0] as AiPolicyResolveRow | undefined) : undefined;
  const decisionType = readAiPolicyDecisionType(row?.decision_type);
  const reasonCode = readAiPolicyReasonCode(row?.reason_code);
  if (!decisionType) {
    return {
      ok: false,
      status: 500,
      error: "AI policy preflight returned an invalid decision payload.",
    };
  }

  if (decisionType !== "ALLOW") {
    return {
      ok: false,
      status: 403,
      error: toHammerPreflightErrorMessage(reasonCode, decisionType),
    };
  }

  return { ok: true };
}

async function runQuenchMetadataPolicyPreflight(args: {
  supabaseUrl: string;
  rpcKey: string;
  userAccessToken: string;
  workspaceId: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const userId = await resolveUserIdFromAccessToken(args);
  if (!userId) {
    return {
      ok: false,
      status: 401,
      error: "Sign in required before Quench metadata assist can run AI policy preflight.",
    };
  }

  const orgId = await resolveOrgIdForWorkspace(args);
  const headers = buildSupabaseRpcHeaders({
    rpcKey: args.rpcKey,
    userAccessToken: args.userAccessToken,
  });

  let response: Response;
  try {
    response = await fetch(`${args.supabaseUrl}/rest/v1/rpc/resolve_ai_policy`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        p_org_id: orgId,
        p_workspace_id: args.workspaceId,
        p_user_id: userId,
        p_tool: "quench",
        p_feature: "research_flows",
        p_action: "chat",
        p_requested_mode: "ORG_FIRST_PERSONAL_FALLBACK",
        p_personal_ai_configured: false,
        p_org_ai_available: true,
        p_requested_funding_source: "org_shared_credits",
        p_write_ledger: true,
      }),
    });
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: `AI policy preflight failed: ${error instanceof Error ? error.message : "Network error"}`,
    };
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: readErrorMessage(payload, `AI policy preflight failed (${response.status}).`),
    };
  }

  const row = Array.isArray(payload) ? (payload[0] as AiPolicyResolveRow | undefined) : undefined;
  const decisionType = readAiPolicyDecisionType(row?.decision_type);
  const reasonCode = readAiPolicyReasonCode(row?.reason_code);
  if (!decisionType) {
    return {
      ok: false,
      status: 500,
      error: "AI policy preflight returned an invalid decision payload.",
    };
  }

  if (decisionType !== "ALLOW") {
    return {
      ok: false,
      status: 403,
      error: toQuenchPreflightErrorMessage(reasonCode, decisionType),
    };
  }

  return { ok: true };
}

function estimateCleanupTimeSavedSec(before: string, after: string): number {
  const beforeWords = before.trim().split(/\s+/).filter(Boolean).length;
  const afterWords = after.trim().split(/\s+/).filter(Boolean).length;
  const delta = Math.max(0, beforeWords - afterWords);
  return Number((Math.max(0.1, delta * 0.11)).toFixed(1));
}

function normalizeOpenAiCleanupChanges(payload: unknown): Array<{ segment_id: string; cleaned_text: string }> {
  const root = readJsonObject(payload);
  const changesRaw = Array.isArray(root?.changes) ? root.changes : [];
  const changes: Array<{ segment_id: string; cleaned_text: string }> = [];
  for (const value of changesRaw) {
    const row = readJsonObject(value);
    const segmentId = readTrimmed(row?.segment_id);
    const cleanedText = readTrimmed(row?.cleaned_text);
    if (!segmentId || !cleanedText) continue;
    changes.push({ segment_id: segmentId, cleaned_text: cleanedText });
  }
  return changes;
}

async function runOpenAiTranscriptCleanupAssist(args: {
  apiKey: string;
  model: string;
  request: CleanupAssistRequest;
}): Promise<{
  resultSegments: CleanupAssistSegment[];
  suggestions: Array<{
    id: string;
    type: "filler_remove" | "repetition_collapse" | "fragment_merge";
    segmentId: string;
    description: string;
    confidence: number;
    timeSavedSec: number;
  }>;
}> {
  const selectedSegments = args.request.segments.filter((segment) => args.request.segment_ids.includes(segment.segment_id));
  if (selectedSegments.length === 0) {
    return {
      resultSegments: args.request.segments,
      suggestions: [],
    };
  }

  const systemPrompt =
    "You are a transcript cleanup assistant. Improve readability while preserving meaning, speaker intent, and factual content. " +
    "Do not add new claims. Return JSON only in shape {\"changes\":[{\"segment_id\":\"...\",\"cleaned_text\":\"...\"}]} for selected segments.";
  const userPrompt = JSON.stringify({
    instruction: "Tighten selected transcript lines: remove filler/repetition/restart clutter conservatively.",
    selected_segments: selectedSegments.map((segment) => ({
      segment_id: segment.segment_id,
      speaker: segment.speaker,
      text: segment.text,
    })),
  });

  const upstreamTimeout = createTimeoutAbortController(OPENAI_CLEANUP_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${args.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: args.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: upstreamTimeout.controller.signal,
    });
  } finally {
    upstreamTimeout.dispose();
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    throw new Error(readUpstreamErrorMessage(detail) ?? "OpenAI transcript cleanup assist failed.");
  }

  const payload = await upstream.json().catch(() => null);
  const payloadRow = readJsonObject(payload);
  const choices = Array.isArray(payloadRow?.choices) ? payloadRow.choices : [];
  const firstChoice = readJsonObject(choices[0]);
  const message = readJsonObject(firstChoice?.message);
  const rawContent = readChatMessageContent(message?.content);
  if (!rawContent) {
    throw new Error("OpenAI transcript cleanup assist returned an empty response.");
  }

  let parsedContent: unknown = null;
  try {
    parsedContent = JSON.parse(rawContent);
  } catch {
    throw new Error("OpenAI transcript cleanup assist returned invalid JSON.");
  }

  const changes = normalizeOpenAiCleanupChanges(parsedContent);
  const changesById = new Map(changes.map((change) => [change.segment_id, change.cleaned_text]));
  const suggestions: Array<{
    id: string;
    type: "filler_remove" | "repetition_collapse" | "fragment_merge";
    segmentId: string;
    description: string;
    confidence: number;
    timeSavedSec: number;
  }> = [];
  const resultSegments = args.request.segments.map((segment) => {
    const cleaned = changesById.get(segment.segment_id);
    if (!cleaned || cleaned === segment.text) return segment;
    const timeSavedSec = estimateCleanupTimeSavedSec(segment.text, cleaned);
    suggestions.push({
      id: `ai_cleanup:${segment.segment_id}`,
      type: "filler_remove",
      segmentId: segment.segment_id,
      description: "AI tightened transcript wording while preserving meaning.",
      confidence: 0.82,
      timeSavedSec,
    });
    return {
      ...segment,
      text: cleaned,
    };
  });

  return {
    resultSegments,
    suggestions,
  };
}

function normalizeOpenAiQuenchMetadataDraft(payload: unknown): {
  title: string;
  description: string;
  tags: string[];
} | null {
  const row = readJsonObject(payload);
  const title = readTrimmed(row?.title);
  const description = readTrimmed(row?.description);
  const tagsRaw = Array.isArray(row?.tags) ? row.tags : [];
  const tags = Array.from(new Set(
    tagsRaw
      .map((value) => readTrimmed(value))
      .filter((value): value is string => Boolean(value))
      .slice(0, 12),
  ));
  if (!title || !description) return null;
  return {
    title,
    description,
    tags,
  };
}

async function runOpenAiQuenchMetadataAssist(args: {
  apiKey: string;
  model: string;
  request: QuenchMetadataAssistRequest;
}): Promise<{
  title: string;
  description: string;
  tags: string[];
}> {
  const systemPrompt =
    "You are a podcast release metadata assistant. Improve clarity and discoverability while staying faithful to source intent. " +
    "Return JSON only: {\"title\":\"...\",\"description\":\"...\",\"tags\":[\"...\"]}.";
  const userPrompt = JSON.stringify({
    instruction: "Draft a tighter title, cleaner description, and concise tags for release packaging.",
    title: args.request.title,
    description: args.request.description,
    tags: args.request.tags,
  });

  const upstreamTimeout = createTimeoutAbortController(OPENAI_CLEANUP_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${args.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: args.model,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: upstreamTimeout.controller.signal,
    });
  } finally {
    upstreamTimeout.dispose();
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    throw new Error(readUpstreamErrorMessage(detail) ?? "OpenAI Quench metadata assist failed.");
  }

  const payload = await upstream.json().catch(() => null);
  const payloadRow = readJsonObject(payload);
  const choices = Array.isArray(payloadRow?.choices) ? payloadRow.choices : [];
  const firstChoice = readJsonObject(choices[0]);
  const message = readJsonObject(firstChoice?.message);
  const rawContent = readChatMessageContent(message?.content);
  if (!rawContent) {
    throw new Error("OpenAI Quench metadata assist returned an empty response.");
  }

  let parsedContent: unknown = null;
  try {
    parsedContent = JSON.parse(rawContent);
  } catch {
    throw new Error("OpenAI Quench metadata assist returned invalid JSON.");
  }

  const draft = normalizeOpenAiQuenchMetadataDraft(parsedContent);
  if (!draft) {
    throw new Error("OpenAI Quench metadata assist returned an invalid draft payload.");
  }
  return draft;
}

async function loadCanonicalWorkpieceMediaFile(
  req: IncomingMessage,
  request: NormalizedCanonicalWorkpieceRequest,
): Promise<{
  ok: true;
  contentType: string;
  fileBytes: Buffer;
  sourceLabel: string;
} | {
  ok: false;
  status: number;
  message: string;
}> {
  const origin = buildRequestOrigin(req);
  const url = new URL(`/tongs/workpieces/${encodeURIComponent(request.workpiece_id)}/read-file`, origin);
  url.searchParams.set("path", request.canonical_workpiece_path);
  url.searchParams.set("encoding", "binary");

  const fetchTimeout = createTimeoutAbortController(CANONICAL_MEDIA_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/octet-stream, application/json",
        ...(typeof req.headers.authorization === "string"
          ? { authorization: req.headers.authorization }
          : {}),
        ...(typeof req.headers["x-forge-user-authorization"] === "string"
          ? { "x-forge-user-authorization": req.headers["x-forge-user-authorization"] }
          : {}),
      },
      signal: fetchTimeout.controller.signal,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      return {
        ok: false,
        status: response.status,
        message: readErrorMessage(payload, "Hammer could not read canonical workpiece media."),
      };
    }

    const contentLength = readHeaderNumber(response.headers, "content-length");
    if (contentLength != null && contentLength > MAX_TRANSCRIBE_SOURCE_BYTES) {
      return {
        ok: false,
        status: 413,
        message: buildSourceTooLargeMessage(contentLength),
      };
    }

    const fileBytes = Buffer.from(await response.arrayBuffer());
    if (fileBytes.byteLength > MAX_TRANSCRIBE_SOURCE_BYTES) {
      return {
        ok: false,
        status: 413,
        message: buildSourceTooLargeMessage(fileBytes.byteLength),
      };
    }

    return {
      ok: true,
      contentType: readTrimmed(response.headers.get("content-type"))
        ?? inferContentType(request.canonical_workpiece_path, request.mime_type),
      fileBytes,
      sourceLabel: request.canonical_workpiece_path,
    };
  } catch (error) {
    if (fetchTimeout.controller.signal.aborted) {
      return {
        ok: false,
        status: 504,
        message: "Hammer timed out while reading canonical workpiece media.",
      };
    }
    throw error;
  } finally {
    fetchTimeout.dispose();
  }
}

function normalizeSegments(payload: unknown): HammerTranscriptPrepSegment[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const row = payload as Record<string, unknown>;
  const segmentsRaw = Array.isArray(row.segments)
    ? row.segments
    : Array.isArray(row.utterances)
      ? row.utterances
      : [];

  const segments: HammerTranscriptPrepSegment[] = [];
  segmentsRaw.forEach((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const segment = value as Record<string, unknown>;
    const start = readNumber(segment.start);
    const end = readNumber(segment.end);
    const text = readTrimmed(segment.text);
    if (start == null || end == null || end <= start || !text) {
      return;
    }
    segments.push({
      id: readTrimmed(segment.id) ?? `seg_${index + 1}`,
      start,
      end,
      text,
      speaker: readTrimmed(segment.speaker)
        ?? readTrimmed(segment.speaker_label)
        ?? readTrimmed(segment.speaker_id),
      confidence: readNumber(segment.confidence),
    });
  });
  return segments;
}

export function createHammerPrepMiddleware() {
  const runtimeConfig = resolveHearthRuntimeConfig();
  const textApiKey = runtimeConfig.textApiKey ?? runtimeConfig.apiKey ?? null;
  const model = readTrimmed(process.env.HAMMER_TRANSCRIBE_MODEL) ?? DEFAULT_TRANSCRIBE_MODEL;
  const cleanupModel = readTrimmed(process.env.HAMMER_EDITORIAL_AI_MODEL) ?? "gpt-5.4-mini";
  const quenchMetadataModel = readTrimmed(process.env.QUENCH_METADATA_AI_MODEL) ?? "gpt-5.4-mini";
  const supabaseService: SupabaseClient<Database> | null = runtimeConfig.supabaseUrl && runtimeConfig.supabaseServiceRoleKey
    ? createClient<Database>(runtimeConfig.supabaseUrl, runtimeConfig.supabaseServiceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    : null;
  const hammerTelemetryLane: BillingMode = AI_USAGE_LANE.FORGE;

  return async function hammerPrepMiddleware(req: IncomingMessage, res: ServerResponse, next: Next) {
    try {
      const rawUrl = req.url || "";
      const origin = `http://${req.headers.host || "localhost"}`;
      const url = new URL(rawUrl, origin);
      if (
        url.pathname !== HAMMER_TRANSCRIPT_PREP_ROUTE
        && url.pathname !== QUENCH_METADATA_ASSIST_ROUTE
        && url.pathname !== HAMMER_TRANSCRIPT_CLEANUP_ASSIST_ROUTE
        && url.pathname !== HAMMER_VISUAL_ASSIST_PREFLIGHT_ROUTE
        && url.pathname !== HAMMER_AUDIO_POLISH_ROUTE
        && url.pathname !== HAMMER_AUDIO_POLISH_STATUS_ROUTE
        && url.pathname !== HAMMER_STUDIO_RACK_RENDER_ROUTE
      ) {
        next();
        return;
      }

      const method = (req.method || "GET").toUpperCase();

      if (url.pathname === HAMMER_AUDIO_POLISH_STATUS_ROUTE) {
        if (method !== "GET") {
          sendJson(res, 405, { ok: false, error: { message: "Method not allowed." } });
          return;
        }
        const workspaceId = readTrimmed(url.searchParams.get("workspace_id"));
        const workpieceId = readTrimmed(url.searchParams.get("workpiece_id"));
        if (!workspaceId || !workpieceId) {
          sendJson(res, 400, { ok: false, error: { message: "workspace_id and workpiece_id are required." } });
          return;
        }
        const key = buildAudioPolishProgressKey(workspaceId, workpieceId);
        const progress = hammerAudioPolishProgressByKey.get(key) ?? null;
        sendJson(res, 200, {
          ok: true,
          data: progress
            ? {
              status: progress.status,
              phase: progress.phase,
              failed_phase: progress.failedPhase,
              error_message: progress.errorMessage,
              updated_at: progress.updatedAt,
            }
            : {
              status: "missing",
              phase: null,
              failed_phase: null,
              error_message: null,
              updated_at: null,
            },
        });
        return;
      }

      if (method !== "POST") {
        sendJson(res, 405, { ok: false, error: { message: "Method not allowed." } });
        return;
      }

      const body = await readJsonBody(req);
      if (url.pathname === HAMMER_AUDIO_POLISH_ROUTE) {
        const bodyRow = readJsonObject(body);
        const workspaceId = readTrimmed(bodyRow?.workspace_id);
        const workpieceId = readTrimmed(bodyRow?.workpiece_id);
        const progressKey = workspaceId && workpieceId
          ? buildAudioPolishProgressKey(workspaceId, workpieceId)
          : null;
        if (progressKey && workspaceId && workpieceId) {
          hammerAudioPolishProgressByKey.set(progressKey, {
            workspaceId,
            workpieceId,
            status: "running",
            phase: null,
            failedPhase: null,
            errorMessage: null,
            updatedAt: new Date().toISOString(),
          });
        }

        let result;
        try {
          result = await handleHammerAudioPolishRequest(
            body,
            createHammerAudioPolishRequestContext(req),
            (phase) => {
              if (!progressKey || !workspaceId || !workpieceId) return;
              hammerAudioPolishProgressByKey.set(progressKey, {
                workspaceId,
                workpieceId,
                status: "running",
                phase,
                failedPhase: null,
                errorMessage: null,
                updatedAt: new Date().toISOString(),
              });
            },
          );
        } catch (error) {
          if (progressKey && workspaceId && workpieceId) {
            hammerAudioPolishProgressByKey.set(progressKey, {
              workspaceId,
              workpieceId,
              status: "failed",
              phase: null,
              failedPhase: null,
              errorMessage: error instanceof Error ? error.message : "Hammer audio polish crashed unexpectedly.",
              updatedAt: new Date().toISOString(),
            });
          }
          throw error;
        }
        if (progressKey && workspaceId && workpieceId) {
          const responseData = result.payload.data;
          hammerAudioPolishProgressByKey.set(progressKey, {
            workspaceId,
            workpieceId,
            status: responseData?.status === "failed" ? "failed" : "prepared",
            phase: responseData?.phase ?? null,
            failedPhase: responseData?.failed_phase ?? null,
            errorMessage: responseData?.failure_reason ?? null,
            updatedAt: new Date().toISOString(),
          });
        }
        sendJson(res, result.status, result.payload);
        return;
      }

      if (url.pathname === HAMMER_STUDIO_RACK_RENDER_ROUTE) {
        const result = await handleHammerStudioRackRenderRequest(body, createHammerStudioRackRenderRequestContext(req));
        sendJson(res, result.status, result.payload);
        return;
      }

      if (url.pathname === QUENCH_METADATA_ASSIST_ROUTE) {
        if (!textApiKey) {
          sendJson(res, 500, {
            ok: false,
            error: { message: "Missing OPENAI_TEXT_API_KEY (or OPENAI_API_KEY) in server env." },
          });
          return;
        }

        const assistRequest = normalizeQuenchMetadataAssistRequest(body);
        if (!assistRequest) {
          sendJson(res, 400, { ok: false, error: { message: "Invalid Quench metadata assist payload." } });
          return;
        }

        const userAccessToken = readForgeUserAccessToken(req);
        if (!userAccessToken) {
          sendJson(res, 401, {
            ok: false,
            error: { message: "Sign in required before Quench metadata assist can run AI policy preflight." },
          });
          return;
        }
        if (!runtimeConfig.supabaseUrl || !runtimeConfig.supabaseRpcKey) {
          sendJson(res, 500, {
            ok: false,
            error: { message: "Quench AI policy preflight is not configured on this server." },
          });
          return;
        }

        const preflight = await runQuenchMetadataPolicyPreflight({
          supabaseUrl: runtimeConfig.supabaseUrl,
          rpcKey: runtimeConfig.supabaseRpcKey,
          userAccessToken,
          workspaceId: assistRequest.workspace_id,
        });
        if (!preflight.ok) {
          sendJson(res, preflight.status || 500, { ok: false, error: { message: preflight.error } });
          return;
        }

        const draft = await runOpenAiQuenchMetadataAssist({
          apiKey: textApiKey,
          model: quenchMetadataModel,
          request: assistRequest,
        });
        sendJson(res, 200, {
          ok: true,
          data: { draft },
        });
        return;
      }

      if (url.pathname === HAMMER_TRANSCRIPT_CLEANUP_ASSIST_ROUTE) {
        if (!textApiKey) {
          sendJson(res, 500, {
            ok: false,
            error: { message: "Missing OPENAI_TEXT_API_KEY (or OPENAI_API_KEY) in server env." },
          });
          return;
        }

        const cleanupRequest = normalizeCleanupAssistRequest(body);
        if (!cleanupRequest) {
          sendJson(res, 400, { ok: false, error: { message: "Invalid Hammer transcript cleanup assist payload." } });
          return;
        }

        const userAccessToken = readForgeUserAccessToken(req);
        if (!userAccessToken) {
          sendJson(res, 401, {
            ok: false,
            error: { message: "Sign in required before Hammer transcript cleanup assist can run AI policy preflight." },
          });
          return;
        }
        if (!runtimeConfig.supabaseUrl || !runtimeConfig.supabaseRpcKey) {
          sendJson(res, 500, {
            ok: false,
            error: { message: "Hammer AI policy preflight is not configured on this server." },
          });
          return;
        }

        const preflight = await runHammerTranscriptPolicyPreflight({
          supabaseUrl: runtimeConfig.supabaseUrl,
          rpcKey: runtimeConfig.supabaseRpcKey,
          userAccessToken,
          workspaceId: cleanupRequest.workspace_id,
          action: "chat",
          feature: "heavy_tasks",
        });
        if (!preflight.ok) {
          sendJson(res, preflight.status || 500, { ok: false, error: { message: preflight.error } });
          return;
        }

        const assisted = await runOpenAiTranscriptCleanupAssist({
          apiKey: textApiKey,
          model: cleanupModel,
          request: cleanupRequest,
        });
        const changedIds = new Set(assisted.suggestions.map((suggestion) => suggestion.segmentId));
        sendJson(res, 200, {
          ok: true,
          data: {
            preview: {
              label: "AI Tighten Selection",
              resultSegments: assisted.resultSegments,
              suggestions: assisted.suggestions,
              summary: {
                changedSegments: changedIds.size,
                removedSegments: 0,
                timeSavedSec: Number(
                  assisted.suggestions.reduce((sum, suggestion) => sum + suggestion.timeSavedSec, 0).toFixed(1),
                ),
              },
            },
          },
        });
        return;
      }

      if (url.pathname === HAMMER_VISUAL_ASSIST_PREFLIGHT_ROUTE) {
        const bodyRow = readJsonObject(body);
        const workspaceId = readTrimmed(bodyRow?.workspace_id);
        const workpieceId = readTrimmed(bodyRow?.workpiece_id);
        if (!workspaceId || !workpieceId) {
          sendJson(res, 400, { ok: false, error: { message: "workspace_id and workpiece_id are required." } });
          return;
        }

        const userAccessToken = readForgeUserAccessToken(req);
        if (!userAccessToken) {
          sendJson(res, 401, {
            ok: false,
            error: { message: "Sign in required before Hammer visual assist can run AI policy preflight." },
          });
          return;
        }
        if (!runtimeConfig.supabaseUrl || !runtimeConfig.supabaseRpcKey) {
          sendJson(res, 500, {
            ok: false,
            error: { message: "Hammer AI policy preflight is not configured on this server." },
          });
          return;
        }

        const preflight = await runHammerTranscriptPolicyPreflight({
          supabaseUrl: runtimeConfig.supabaseUrl,
          rpcKey: runtimeConfig.supabaseRpcKey,
          userAccessToken,
          workspaceId,
          action: "chat",
          feature: "research_flows",
        });
        if (!preflight.ok) {
          sendJson(res, preflight.status || 500, { ok: false, error: { message: preflight.error } });
          return;
        }

        sendJson(res, 200, {
          ok: true,
          data: {
            workspace_id: workspaceId,
            workpiece_id: workpieceId,
            decision: "ALLOW",
          },
        });
        return;
      }

      if (!textApiKey) {
        sendJson(res, 500, {
          ok: false,
          error: { message: "Missing OPENAI_TEXT_API_KEY (or OPENAI_API_KEY) in server env." },
        });
        return;
      }

      const request = normalizeRequest(body);
      if (!request) {
        sendJson(res, 400, { ok: false, error: { message: "Invalid Hammer transcript prep payload." } });
        return;
      }

      const userAccessToken = readForgeUserAccessToken(req);
      if (!userAccessToken) {
        sendJson(res, 401, {
          ok: false,
          error: { message: "Sign in required before Hammer transcript prep can run AI policy preflight." },
        });
        return;
      }

      if (!runtimeConfig.supabaseUrl || !runtimeConfig.supabaseRpcKey) {
        sendJson(res, 500, {
          ok: false,
          error: { message: "Hammer AI policy preflight is not configured on this server." },
        });
        return;
      }

      const preflight = await runHammerTranscriptPolicyPreflight({
        supabaseUrl: runtimeConfig.supabaseUrl,
        rpcKey: runtimeConfig.supabaseRpcKey,
        userAccessToken,
        workspaceId: request.workspace_id,
        action: "stt",
        feature: "heavy_tasks",
      });
      if (!preflight.ok) {
        sendJson(res, preflight.status || 500, { ok: false, error: { message: preflight.error } });
        return;
      }

      const userId = await resolveUserIdFromAccessToken({
        supabaseUrl: runtimeConfig.supabaseUrl,
        rpcKey: runtimeConfig.supabaseRpcKey,
        userAccessToken,
      });
      if (!userId) {
        sendJson(res, 401, {
          ok: false,
          error: { message: "Sign in required before Hammer transcript prep can log AI usage." },
        });
        return;
      }
      const telemetryActionId = crypto.randomUUID();

      let fileBytes: Buffer;
      let sourceLabel: string;
      let contentType: string;

      if ("local_root_abs" in request && "local_relpath" in request) {
        if (!path.isAbsolute(request.local_root_abs) || !fs.existsSync(request.local_root_abs)) {
          sendJson(res, 404, { ok: false, error: { message: "Mapped media root was not found on this machine." } });
          return;
        }

        const absolutePath = resolveMediaFileAbs(request.local_root_abs, request.local_relpath);
        if (!absolutePath) {
          sendJson(res, 400, { ok: false, error: { message: "local_relpath is invalid for this media root." } });
          return;
        }

        const stat = await fsPromises.stat(absolutePath).catch(() => null);
        if (!stat || !stat.isFile()) {
          sendJson(res, 404, { ok: false, error: { message: "Requested media file was not found." } });
          return;
        }
        if (stat.size > MAX_TRANSCRIBE_SOURCE_BYTES) {
          sendJson(res, 413, { ok: false, error: { message: buildSourceTooLargeMessage(stat.size) } });
          return;
        }

        fileBytes = await fsPromises.readFile(absolutePath);
        sourceLabel = absolutePath;
        contentType = inferContentType(absolutePath, request.mime_type);
      } else {
        const canonicalMedia = await loadCanonicalWorkpieceMediaFile(req, request);
        if (!canonicalMedia.ok) {
          sendJson(res, canonicalMedia.status, { ok: false, error: { message: canonicalMedia.message } });
          return;
        }
        fileBytes = canonicalMedia.fileBytes;
        sourceLabel = canonicalMedia.sourceLabel;
        contentType = canonicalMedia.contentType;
      }

      const extension = path.extname(sourceLabel).toLowerCase();
      if (!ALLOWED_MEDIA_EXTENSIONS.has(extension)) {
        sendJson(res, 400, { ok: false, error: { message: "Hammer prep only supports audio/video media files." } });
        return;
      }
      const form = new FormData();
      form.set("model", model);
      form.set("response_format", "diarized_json");
      form.set("chunking_strategy", "auto");
      form.set(
        "file",
        new Blob([fileBytes], { type: contentType }),
        path.basename(sourceLabel),
      );

      const upstreamTimeout = createTimeoutAbortController(OPENAI_TRANSCRIBE_TIMEOUT_MS);
      let upstream: Response;
      try {
        upstream = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            authorization: `Bearer ${textApiKey}`,
          },
          body: form,
          signal: upstreamTimeout.controller.signal,
        });
      } catch (error) {
        if (upstreamTimeout.controller.signal.aborted) {
          sendJson(res, 504, {
            ok: false,
            error: {
              message: "Hammer transcript prep timed out while waiting for OpenAI transcription.",
            },
          });
          return;
        }
        throw error;
      } finally {
        upstreamTimeout.dispose();
      }

      if (!upstream.ok) {
        const detail = await upstream.text();
        await recordAiUsageEvent({
          supabaseService,
          userId,
          lane: hammerTelemetryLane,
          provider: "openai",
          workspaceId: request.workspace_id,
          workpieceId: request.workpiece_id,
          sessionId: null,
          feature: AI_USAGE_FEATURE.SPEECH_TRANSCRIPTION,
          subfeature: AI_USAGE_SUBFEATURE.HAMMER_PREP_NONBILLABLE,
          model,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: 0,
          actualCostUsd: 0,
          billableTokens: 0,
          trigger: AI_USAGE_TRIGGER.USER,
          status: AI_USAGE_STATUS.ERROR,
          actionId: telemetryActionId,
          providerRequestId: upstream.headers.get("x-request-id"),
          correlationId: telemetryActionId,
        });
        sendJson(res, upstream.status, {
          ok: false,
          error: {
            message: readUpstreamErrorMessage(detail) ?? "OpenAI transcription failed.",
            detail,
          },
        });
        return;
      }

      const payload = (await upstream.json()) as unknown;
      const segments = normalizeSegments(payload);
      if (segments.length === 0) {
        await recordAiUsageEvent({
          supabaseService,
          userId,
          lane: hammerTelemetryLane,
          provider: "openai",
          workspaceId: request.workspace_id,
          workpieceId: request.workpiece_id,
          sessionId: null,
          feature: AI_USAGE_FEATURE.SPEECH_TRANSCRIPTION,
          subfeature: AI_USAGE_SUBFEATURE.HAMMER_PREP_NONBILLABLE,
          model,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: 0,
          actualCostUsd: 0,
          billableTokens: 0,
          trigger: AI_USAGE_TRIGGER.USER,
          status: AI_USAGE_STATUS.ERROR,
          actionId: telemetryActionId,
          providerRequestId: upstream.headers.get("x-request-id"),
          correlationId: telemetryActionId,
        });
        sendJson(res, 502, {
          ok: false,
          error: {
            message: "OpenAI returned a diarized transcript without usable segments.",
          },
        });
        return;
      }

      const payloadRow = payload && typeof payload === "object" && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : {};
      const transcriptText = readTrimmed(payloadRow.text)
        ?? segments.map((segment) => segment.text).filter(Boolean).join(" ");
      const accounting = buildTranscriptionAccounting({
        model,
        payload,
        text: transcriptText,
        billableMode: "non-billable",
      });
      await recordAiUsageEvent({
        supabaseService,
        userId,
        lane: hammerTelemetryLane,
        provider: "openai",
        workspaceId: request.workspace_id,
        workpieceId: request.workpiece_id,
        sessionId: null,
        feature: AI_USAGE_FEATURE.SPEECH_TRANSCRIPTION,
        subfeature: AI_USAGE_SUBFEATURE.HAMMER_PREP_NONBILLABLE,
        model,
        inputTokens: accounting.inputTokens,
        outputTokens: accounting.outputTokens,
        totalTokens: accounting.totalTokens,
        estimatedCostUsd: accounting.estimatedCostUsd,
        actualCostUsd: accounting.actualCostUsd,
        billableTokens: accounting.billableTokens,
        trigger: AI_USAGE_TRIGGER.USER,
        status: AI_USAGE_STATUS.SUCCESS,
        actionId: telemetryActionId,
        providerRequestId: upstream.headers.get("x-request-id"),
        correlationId: telemetryActionId,
      });
      sendJson(res, 200, {
        ok: true,
        data: {
          provider: "openai",
          model,
          provider_request_id: upstream.headers.get("x-request-id"),
          text: readTrimmed(payloadRow.text),
          segments,
        },
      });
    } catch (error) {
      next(error);
    }
  };
}
