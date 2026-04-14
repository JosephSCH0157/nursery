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
const DEFAULT_CHAT_FALLBACK_MODEL = "gpt-4o-mini";
const ALLOWED_MEDIA_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".wav", ".mp3", ".m4a"]);
const MAX_TRANSCRIBE_SOURCE_BYTES = 96 * 1024 * 1024;
const CANONICAL_MEDIA_FETCH_TIMEOUT_MS = 60_000;
const DEFAULT_OPENAI_TRANSCRIBE_TIMEOUT_MS = 15 * 60 * 1000;
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

function resolveOpenAiTranscribeTimeoutMs(): number {
  const raw = process.env.HAMMER_OPENAI_TRANSCRIBE_TIMEOUT_MS;
  if (!raw) return DEFAULT_OPENAI_TRANSCRIBE_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_OPENAI_TRANSCRIBE_TIMEOUT_MS;
  const clamped = Math.max(30_000, Math.min(60 * 60 * 1000, Math.trunc(parsed)));
  return clamped;
}

type HammerTranscriptStageTimer = {
  mark: (stage: string, detail?: Record<string, unknown>, level?: "info" | "warn" | "error") => void;
  elapsedMs: () => number;
};

function createHammerTranscriptStageTimer(args: {
  runId: string;
  workspaceId: string;
  workpieceId: string;
  mediaKind: string | null;
  clientRequestId: string | null;
}): HammerTranscriptStageTimer {
  const startedAt = Date.now();
  let stageIndex = 0;
  const base = {
    run_id: args.runId,
    client_request_id: args.clientRequestId,
    workspace_id: args.workspaceId,
    workpiece_id: args.workpieceId,
    media_kind: args.mediaKind,
  };
  const elapsedMs = () => Math.max(0, Date.now() - startedAt);
  const mark: HammerTranscriptStageTimer["mark"] = (stage, detail, level = "info") => {
    stageIndex += 1;
    const payload = {
      ...base,
      stage_index: stageIndex,
      stage,
      elapsed_ms: elapsedMs(),
      ...(detail ?? {}),
    };
    (level === "error" ? console.error : level === "warn" ? console.warn : console.info)(
      "[HammerTranscriptPrep]",
      payload,
    );
  };
  return { mark, elapsedMs };
}

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

type HammerTranscriptPrepErrorCode =
  | "AUTH_REQUIRED"
  | "POLICY_DENIED"
  | "SERVER_NOT_CONFIGURED"
  | "SOURCE_TOO_LARGE"
  | "MEDIA_READ_TIMEOUT"
  | "MEDIA_READ_FAILED"
  | "MEDIA_READ_FORBIDDEN"
  | "OPENAI_TIMEOUT"
  | "OPENAI_UPSTREAM_ERROR"
  | "NORMALIZE_EMPTY"
  | "INVALID_REQUEST"
  | "UNKNOWN_ERROR";

const AI_POLICY_REASON_CODE_SET = new Set<string>(AI_REASON_CODES);

function readTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readPrepMetaFromBody(body: unknown): {
  workspace_id: string | null;
  workpiece_id: string | null;
  client_request_id: string | null;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { workspace_id: null, workpiece_id: null, client_request_id: null };
  }
  const row = body as Record<string, unknown>;
  return {
    workspace_id: readTrimmed(row.workspace_id),
    workpiece_id: readTrimmed(row.workpiece_id),
    client_request_id: readTrimmed(row.client_request_id),
  };
}

function ensureClientRequestId(explicit: string | null): string {
  if (explicit && explicit.trim()) return explicit.trim();
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `server_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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

function sendTranscriptPrepError(res: ServerResponse, args: {
  status: number;
  code: HammerTranscriptPrepErrorCode;
  message: string;
  retryable: boolean;
  detail?: unknown;
  provider_request_id?: string | null;
  meta: {
    workspace_id: string | null;
    workpiece_id: string | null;
    client_request_id: string | null;
  };
}): void {
  sendJson(res, args.status, {
    ok: false,
    error: {
      code: args.code,
      message: args.message,
      retryable: args.retryable,
      ...(typeof args.detail === "undefined" ? {} : { detail: args.detail }),
    },
    meta: {
      timestamp: new Date().toISOString(),
      workspace_id: args.meta.workspace_id,
      workpiece_id: args.meta.workpiece_id,
      client_request_id: ensureClientRequestId(args.meta.client_request_id),
      ...(args.provider_request_id ? { provider_request_id: args.provider_request_id } : {}),
    },
  });
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
  const clientRequestId = readTrimmed(row.client_request_id);
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
      client_request_id: clientRequestId,
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
    client_request_id: clientRequestId,
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

function isModelAccessError(message: string, model: string): boolean {
  const normalized = message.toLowerCase();
  const modelNeedle = model.toLowerCase();
  if (!normalized.includes(modelNeedle)) return false;
  return normalized.includes("does not exist") || normalized.includes("do not have access");
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

  const runRequest = async (model: string): Promise<Response> => {
    const upstreamTimeout = createTimeoutAbortController(OPENAI_CLEANUP_TIMEOUT_MS);
    try {
      return await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${args.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
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
  };

  let upstream: Response;
  try {
    upstream = await runRequest(args.model);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "OpenAI transcript cleanup assist failed.");
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    const message = readUpstreamErrorMessage(detail) ?? "OpenAI transcript cleanup assist failed.";
    if (args.model !== DEFAULT_CHAT_FALLBACK_MODEL && isModelAccessError(message, args.model)) {
      const fallbackUpstream = await runRequest(DEFAULT_CHAT_FALLBACK_MODEL);
      if (!fallbackUpstream.ok) {
        const fallbackDetail = await fallbackUpstream.text().catch(() => "");
        throw new Error(readUpstreamErrorMessage(fallbackDetail) ?? message);
      }
      upstream = fallbackUpstream;
    } else {
      throw new Error(message);
    }
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
  detail?: unknown;
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
        detail: {
          max_source_bytes: MAX_TRANSCRIBE_SOURCE_BYTES,
          observed_bytes: contentLength,
        },
      };
    }

    const fileBytes = Buffer.from(await response.arrayBuffer());
    if (fileBytes.byteLength > MAX_TRANSCRIBE_SOURCE_BYTES) {
      return {
        ok: false,
        status: 413,
        message: buildSourceTooLargeMessage(fileBytes.byteLength),
        detail: {
          max_source_bytes: MAX_TRANSCRIBE_SOURCE_BYTES,
          observed_bytes: fileBytes.byteLength,
        },
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
  type RawSegment = {
    id: string;
    start: number;
    end: number;
    text: string;
    speaker: string | null;
    confidence: number | null;
  };

  const ABS_MAX_DURATION_SEC = 8.0;
  const ABS_MAX_WORDS = 24;
  const PREF_MERGE_MAX_DURATION_SEC = 5.5;
  const PREF_MERGE_MAX_WORDS = 14;

  const STRONG_PUNCT_RE = /[.!?…]+$/u;
  const SENTENCE_SPLIT_RE = /(?<=[.!?…])\s+/u;

  function countWords(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  function endsWithStrongPunctuation(text: string): boolean {
    return STRONG_PUNCT_RE.test(text.trim());
  }

  function splitToSentences(text: string): string[] {
    const normalized = text.trim().replace(/\s+/g, " ");
    if (!normalized) return [];
    const parts = normalized.split(SENTENCE_SPLIT_RE).map((part) => part.trim()).filter(Boolean);
    return parts.length > 0 ? parts : [normalized];
  }

  function splitSentenceToWordWindows(sentence: string): string[] {
    const words = sentence.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    if (words.length <= ABS_MAX_WORDS) return [sentence.trim()];

    const out: string[] = [];
    let cursor = 0;
    while (cursor < words.length) {
      const remaining = words.length - cursor;
      const target = remaining <= 12 ? remaining : 10;
      const take = Math.min(Math.max(8, target), remaining, 12);
      out.push(words.slice(cursor, cursor + take).join(" "));
      cursor += take;
    }
    return out;
  }

  function splitOversizedRange(args: { text: string; start: number; end: number }): Array<{ text: string; start: number; end: number }> {
    const duration = args.end - args.start;
    const wordCount = countWords(args.text);
    if (!Number.isFinite(duration) || duration <= 0 || wordCount <= 0) {
      return [];
    }

    const tooLongByDuration = duration > ABS_MAX_DURATION_SEC;
    const tooLongByWords = wordCount > ABS_MAX_WORDS;
    if (!tooLongByDuration && !tooLongByWords) {
      return [{ ...args, text: args.text.trim().replace(/\s+/g, " ") }];
    }

    const minPartsByDuration = Math.ceil(duration / ABS_MAX_DURATION_SEC);
    const minPartsByWords = Math.ceil(wordCount / ABS_MAX_WORDS);
    const parts = Math.max(1, Math.max(minPartsByDuration, minPartsByWords));
    const wordsPerPart = Math.max(1, Math.ceil(wordCount / parts));

    const words = args.text.trim().split(/\s+/).filter(Boolean);
    const out: Array<{ text: string; start: number; end: number }> = [];
    for (let partIndex = 0; partIndex < parts; partIndex += 1) {
      const startWordIndex = partIndex * wordsPerPart;
      if (startWordIndex >= words.length) break;
      const endWordIndexExclusive = Math.min(words.length, startWordIndex + wordsPerPart);
      const partText = words.slice(startWordIndex, endWordIndexExclusive).join(" ").trim();
      if (!partText) continue;

      const startRatio = startWordIndex / words.length;
      const endRatio = endWordIndexExclusive / words.length;
      const partStart = args.start + (duration * startRatio);
      const partEnd = Math.max(partStart + 0.05, args.start + (duration * endRatio));
      out.push({ text: partText, start: partStart, end: Math.min(args.end, partEnd) });
    }

    return out.length > 0 ? out.flatMap((part) => splitOversizedRange(part)) : [];
  }

  function normalizeOne(raw: RawSegment): HammerTranscriptPrepSegment[] {
    const duration = raw.end - raw.start;
    const normalizedText = raw.text.trim().replace(/\s+/g, " ");
    if (!normalizedText) return [];
    if (!Number.isFinite(duration) || duration <= 0) return [];

    const sentences = splitToSentences(normalizedText);
    const sentenceParts = sentences.flatMap((sentence) => splitSentenceToWordWindows(sentence));
    const totalWords = sentenceParts.reduce((sum, part) => sum + countWords(part), 0);
    const safeTotalWords = Math.max(1, totalWords);

    const preliminary: Array<{ text: string; start: number; end: number }> = [];
    let cursorStart = raw.start;
    for (let index = 0; index < sentenceParts.length; index += 1) {
      const partText = sentenceParts[index];
      const partWords = Math.max(1, countWords(partText));
      const partDuration = duration * (partWords / safeTotalWords);
      const nextEnd = Math.min(raw.end, Math.max(cursorStart + 0.05, cursorStart + partDuration));
      preliminary.push({ text: partText, start: cursorStart, end: nextEnd });
      cursorStart = nextEnd;
    }

    // Rebalance: enforce duration/word limits deterministically.
    const splitParts = preliminary.flatMap((part) => splitOversizedRange(part));
    const withSpeaker = splitParts.map((part) => ({
      ...part,
      speaker: raw.speaker,
      confidence: raw.confidence,
    }));

    // Conservative merge of tiny fragments (never across strong punctuation or speaker changes).
    const merged: typeof withSpeaker = [];
    for (const part of withSpeaker) {
      const prev = merged.at(-1) ?? null;
      if (
        prev
        && prev.speaker === part.speaker
        && !endsWithStrongPunctuation(prev.text)
      ) {
        const combinedText = `${prev.text} ${part.text}`.trim().replace(/\s+/g, " ");
        const combinedDuration = part.end - prev.start;
        const combinedWords = countWords(prev.text) + countWords(part.text);
        if (combinedDuration <= PREF_MERGE_MAX_DURATION_SEC && combinedWords <= PREF_MERGE_MAX_WORDS) {
          prev.text = combinedText;
          prev.end = Math.max(prev.end, part.end);
          continue;
        }
      }
      merged.push({ ...part });
    }

    const hardClamped = merged.flatMap((part) => {
      const duration = part.end - part.start;
      if (duration <= ABS_MAX_DURATION_SEC && countWords(part.text) <= ABS_MAX_WORDS) {
        return [part];
      }
      return splitOversizedRange({ text: part.text, start: part.start, end: part.end }).map((range) => ({
        ...range,
        speaker: part.speaker,
        confidence: part.confidence,
      }));
    });

    return hardClamped
      .map((part) => ({
        start: part.start,
        end: part.end,
        text: part.text,
        speaker: part.speaker,
        ...(part.confidence == null ? {} : { confidence: part.confidence }),
      } satisfies HammerTranscriptPrepSegment));
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const row = payload as Record<string, unknown>;
  const segmentsRaw = Array.isArray(row.segments)
    ? row.segments
    : Array.isArray(row.utterances)
      ? row.utterances
      : [];

  const rawSegments: RawSegment[] = [];
  segmentsRaw.forEach((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const segment = value as Record<string, unknown>;
    const start = readNumber(segment.start);
    const end = readNumber(segment.end);
    const text = readTrimmed(segment.text);
    if (start == null || end == null || end <= start || !text) {
      return;
    }
    rawSegments.push({
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

  // Keep segmentation deterministic and placement-friendly:
  // - Sentence-first splits
  // - Enforce hard duration/word caps
  // - Conservative merges only for tiny fragments
  const normalized: HammerTranscriptPrepSegment[] = [];
  for (const raw of rawSegments.sort((left, right) => left.start - right.start)) {
    const parts = normalizeOne(raw);
    for (const part of parts) {
      // Prefer <= 6s, but only enforce 8s hard cap (splitting happens above).
      const duration = part.end - part.start;
      const wordCount = countWords(part.text);
      if (duration > ABS_MAX_DURATION_SEC || wordCount > ABS_MAX_WORDS) {
        continue;
      }
      normalized.push(part);
    }
  }

  // If we ended up with extremely coarse output, keep it as-is (better than empty),
  // but ensure we never regress below 1 segment for valid payloads.
  if (normalized.length === 0 && rawSegments.length > 0) {
    return rawSegments.map((raw) => ({
      id: raw.id,
      start: raw.start,
      end: raw.end,
      text: raw.text.trim().replace(/\s+/g, " "),
      speaker: raw.speaker,
      ...(raw.confidence == null ? {} : { confidence: raw.confidence }),
    } satisfies HammerTranscriptPrepSegment));
  }

  // Assign stable ids.
  return normalized.map((segment, index) => ({
    id: `seg_${index + 1}`,
    ...segment,
  }));
}

export function createHammerPrepMiddleware() {
  const runtimeConfig = resolveHearthRuntimeConfig();
  const textApiKey = runtimeConfig.textApiKey ?? runtimeConfig.apiKey ?? null;
  const model = readTrimmed(process.env.HAMMER_TRANSCRIBE_MODEL) ?? DEFAULT_TRANSCRIBE_MODEL;
  const cleanupModel = readTrimmed(process.env.HAMMER_EDITORIAL_AI_MODEL) ?? "gpt-5.3";
  const quenchMetadataModel = readTrimmed(process.env.QUENCH_METADATA_AI_MODEL) ?? "gpt-5.3";
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
        if (url.pathname === HAMMER_TRANSCRIPT_PREP_ROUTE) {
          sendTranscriptPrepError(res, {
            status: 405,
            code: "INVALID_REQUEST",
            message: "Method not allowed.",
            retryable: false,
            meta: readPrepMetaFromBody(null),
          });
          return;
        }
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
        sendTranscriptPrepError(res, {
          status: 500,
          code: "SERVER_NOT_CONFIGURED",
          message: "Missing OPENAI_TEXT_API_KEY (or OPENAI_API_KEY) in server env.",
          retryable: false,
          meta: readPrepMetaFromBody(body),
        });
        return;
      }

      const request = normalizeRequest(body);
      if (!request) {
        sendTranscriptPrepError(res, {
          status: 400,
          code: "INVALID_REQUEST",
          message: "Invalid Hammer transcript prep payload.",
          retryable: false,
          meta: readPrepMetaFromBody(body),
        });
        return;
      }

      const telemetryActionId = crypto.randomUUID();
      const stageTimer = createHammerTranscriptStageTimer({
        runId: telemetryActionId,
        workspaceId: request.workspace_id,
        workpieceId: request.workpiece_id,
        mediaKind: request.media_kind,
        clientRequestId: request.client_request_id ?? null,
      });
      const openAiTimeoutMs = resolveOpenAiTranscribeTimeoutMs();
      stageTimer.mark("request:received", {
        has_local_mapping: ("local_root_abs" in request && "local_relpath" in request),
        local_relpath: ("local_relpath" in request ? request.local_relpath : null),
        canonical_workpiece_path: ("canonical_workpiece_path" in request ? request.canonical_workpiece_path : null),
        mime_type_hint: request.mime_type ?? null,
        client_request_id: request.client_request_id ?? null,
        openai_timeout_ms: openAiTimeoutMs,
        max_source_bytes: MAX_TRANSCRIBE_SOURCE_BYTES,
      });

      const userAccessToken = readForgeUserAccessToken(req);
      if (!userAccessToken) {
        stageTimer.mark("request:rejected", { reason: "missing_user_access_token" }, "warn");
        sendTranscriptPrepError(res, {
          status: 401,
          code: "AUTH_REQUIRED",
          message: "Sign in required before Hammer transcript prep can run AI policy preflight.",
          retryable: false,
          meta: {
            workspace_id: request.workspace_id,
            workpiece_id: request.workpiece_id,
            client_request_id: request.client_request_id ?? null,
          },
        });
        return;
      }

      if (!runtimeConfig.supabaseUrl || !runtimeConfig.supabaseRpcKey) {
        stageTimer.mark("request:rejected", { reason: "missing_ai_policy_preflight_config" }, "error");
        sendTranscriptPrepError(res, {
          status: 500,
          code: "SERVER_NOT_CONFIGURED",
          message: "Hammer AI policy preflight is not configured on this server.",
          retryable: false,
          meta: {
            workspace_id: request.workspace_id,
            workpiece_id: request.workpiece_id,
            client_request_id: request.client_request_id ?? null,
          },
        });
        return;
      }

      stageTimer.mark("policy:preflight:start");
      const preflight = await runHammerTranscriptPolicyPreflight({
        supabaseUrl: runtimeConfig.supabaseUrl,
        rpcKey: runtimeConfig.supabaseRpcKey,
        userAccessToken,
        workspaceId: request.workspace_id,
        action: "stt",
        feature: "heavy_tasks",
      });
      if (!preflight.ok) {
        stageTimer.mark("policy:preflight:denied", { status: preflight.status || null, error: preflight.error }, "warn");
        sendTranscriptPrepError(res, {
          status: preflight.status || 500,
          code: "POLICY_DENIED",
          message: preflight.error,
          retryable: false,
          meta: {
            workspace_id: request.workspace_id,
            workpiece_id: request.workpiece_id,
            client_request_id: request.client_request_id ?? null,
          },
        });
        return;
      }
      stageTimer.mark("policy:preflight:ok");

      stageTimer.mark("auth:user_id:start");
      const userId = await resolveUserIdFromAccessToken({
        supabaseUrl: runtimeConfig.supabaseUrl,
        rpcKey: runtimeConfig.supabaseRpcKey,
        userAccessToken,
      });
      if (!userId) {
        stageTimer.mark("auth:user_id:missing", {}, "warn");
        sendTranscriptPrepError(res, {
          status: 401,
          code: "AUTH_REQUIRED",
          message: "Sign in required before Hammer transcript prep can log AI usage.",
          retryable: false,
          meta: {
            workspace_id: request.workspace_id,
            workpiece_id: request.workpiece_id,
            client_request_id: request.client_request_id ?? null,
          },
        });
        return;
      }
      stageTimer.mark("auth:user_id:ok");
      stageTimer.mark("request:accepted");

      let fileBytes: Buffer;
      let sourceLabel: string;
      let contentType: string;

      stageTimer.mark("media:load:start");
      if ("local_root_abs" in request && "local_relpath" in request) {
        if (!path.isAbsolute(request.local_root_abs) || !fs.existsSync(request.local_root_abs)) {
          stageTimer.mark("media:load:failed", { reason: "mapped_media_root_missing", local_root_abs: request.local_root_abs }, "warn");
          sendTranscriptPrepError(res, {
            status: 404,
            code: "MEDIA_READ_FAILED",
            message: "Mapped media root was not found on this machine.",
            retryable: false,
            meta: {
              workspace_id: request.workspace_id,
              workpiece_id: request.workpiece_id,
              client_request_id: request.client_request_id ?? null,
            },
          });
          return;
        }

        const absolutePath = resolveMediaFileAbs(request.local_root_abs, request.local_relpath);
        if (!absolutePath) {
          stageTimer.mark("media:load:failed", { reason: "invalid_local_relpath", local_relpath: request.local_relpath }, "warn");
          sendTranscriptPrepError(res, {
            status: 400,
            code: "INVALID_REQUEST",
            message: "local_relpath is invalid for this media root.",
            retryable: false,
            meta: {
              workspace_id: request.workspace_id,
              workpiece_id: request.workpiece_id,
              client_request_id: request.client_request_id ?? null,
            },
          });
          return;
        }

        const stat = await fsPromises.stat(absolutePath).catch(() => null);
        if (!stat || !stat.isFile()) {
          stageTimer.mark("media:load:failed", { reason: "local_file_missing", absolute_path: absolutePath }, "warn");
          sendTranscriptPrepError(res, {
            status: 404,
            code: "MEDIA_READ_FAILED",
            message: "Requested media file was not found.",
            retryable: false,
            meta: {
              workspace_id: request.workspace_id,
              workpiece_id: request.workpiece_id,
              client_request_id: request.client_request_id ?? null,
            },
          });
          return;
        }
        if (stat.size > MAX_TRANSCRIBE_SOURCE_BYTES) {
          stageTimer.mark("media:load:failed", { reason: "file_too_large", byte_count: stat.size }, "warn");
          sendTranscriptPrepError(res, {
            status: 413,
            code: "SOURCE_TOO_LARGE",
            message: buildSourceTooLargeMessage(stat.size),
            retryable: false,
            detail: {
              max_source_bytes: MAX_TRANSCRIBE_SOURCE_BYTES,
              observed_bytes: stat.size,
            },
            meta: {
              workspace_id: request.workspace_id,
              workpiece_id: request.workpiece_id,
              client_request_id: request.client_request_id ?? null,
            },
          });
          return;
        }

        fileBytes = await fsPromises.readFile(absolutePath);
        sourceLabel = absolutePath;
        contentType = inferContentType(absolutePath, request.mime_type);
      } else {
        stageTimer.mark("media:load:canonical:start", { canonical_workpiece_path: request.canonical_workpiece_path });
        const canonicalMedia = await loadCanonicalWorkpieceMediaFile(req, request);
        if (!canonicalMedia.ok) {
          stageTimer.mark("media:load:canonical:failed", { status: canonicalMedia.status, message: canonicalMedia.message }, "warn");
          const errorCode: HammerTranscriptPrepErrorCode = canonicalMedia.status === 413
            ? "SOURCE_TOO_LARGE"
            : canonicalMedia.status === 504
              ? "MEDIA_READ_TIMEOUT"
              : canonicalMedia.status === 401 || canonicalMedia.status === 403
                ? "MEDIA_READ_FORBIDDEN"
                : "MEDIA_READ_FAILED";
          sendTranscriptPrepError(res, {
            status: canonicalMedia.status,
            code: errorCode,
            message: canonicalMedia.message,
            retryable: errorCode === "MEDIA_READ_TIMEOUT" || errorCode === "MEDIA_READ_FAILED",
            detail: canonicalMedia.detail,
            meta: {
              workspace_id: request.workspace_id,
              workpiece_id: request.workpiece_id,
              client_request_id: request.client_request_id ?? null,
            },
          });
          return;
        }
        fileBytes = canonicalMedia.fileBytes;
        sourceLabel = canonicalMedia.sourceLabel;
        contentType = canonicalMedia.contentType;
        stageTimer.mark("media:load:canonical:ok", { byte_count: fileBytes.byteLength, content_type: contentType });
      }
      stageTimer.mark("media:load:ok", { byte_count: fileBytes.byteLength, content_type: contentType, source_label: sourceLabel });

      const extension = path.extname(sourceLabel).toLowerCase();
      if (!ALLOWED_MEDIA_EXTENSIONS.has(extension)) {
        stageTimer.mark("media:validate:failed", { reason: "unsupported_extension", extension }, "warn");
        sendTranscriptPrepError(res, {
          status: 400,
          code: "INVALID_REQUEST",
          message: "Hammer prep only supports audio/video media files.",
          retryable: false,
          meta: {
            workspace_id: request.workspace_id,
            workpiece_id: request.workpiece_id,
            client_request_id: request.client_request_id ?? null,
          },
        });
        return;
      }
      const isVideo = extension === ".mp4" || extension === ".webm" || extension === ".mov";
      stageTimer.mark("media:transcode:skipped", {
        reason: "sending_source_bytes_directly",
        extension,
        is_video: isVideo,
        note: "Nursery currently sends the original media bytes to OpenAI transcription without extracting audio.",
      });
      const form = new FormData();
      form.set("model", model);
      form.set("response_format", "diarized_json");
      form.set("chunking_strategy", "auto");
      form.set(
        "file",
        new Blob([fileBytes], { type: contentType }),
        path.basename(sourceLabel),
      );

      const upstreamTimeout = createTimeoutAbortController(openAiTimeoutMs);
      let upstream: Response;
      try {
        stageTimer.mark("openai:request:start", {
          model,
          response_format: "diarized_json",
          chunking_strategy: "auto",
          content_type: contentType,
          file_name: path.basename(sourceLabel),
          byte_count: fileBytes.byteLength,
        });
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
          stageTimer.mark("openai:request:timeout", { timeout_ms: openAiTimeoutMs }, "warn");
          sendTranscriptPrepError(res, {
            status: 504,
            code: "OPENAI_TIMEOUT",
            message: "Hammer transcript prep timed out while waiting for OpenAI transcription.",
            retryable: true,
            meta: {
              workspace_id: request.workspace_id,
              workpiece_id: request.workpiece_id,
              client_request_id: request.client_request_id ?? null,
            },
          });
          return;
        }
        stageTimer.mark("openai:request:failed", { error: error instanceof Error ? error.message : String(error) }, "error");
        sendTranscriptPrepError(res, {
          status: 502,
          code: "OPENAI_UPSTREAM_ERROR",
          message: `Hammer transcript prep could not reach OpenAI transcription (${error instanceof Error ? error.message : "unknown error"}).`,
          retryable: true,
          meta: {
            workspace_id: request.workspace_id,
            workpiece_id: request.workpiece_id,
            client_request_id: request.client_request_id ?? null,
          },
        });
        return;
      } finally {
        upstreamTimeout.dispose();
      }

      stageTimer.mark("openai:response:received", {
        status: upstream.status,
        provider_request_id: upstream.headers.get("x-request-id"),
      });
      if (!upstream.ok) {
        const detail = await upstream.text();
        stageTimer.mark("openai:response:error", { status: upstream.status, detail_sample: detail.slice(0, 400) }, "warn");
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
        sendTranscriptPrepError(res, {
          status: upstream.status,
          code: "OPENAI_UPSTREAM_ERROR",
          message: readUpstreamErrorMessage(detail) ?? "OpenAI transcription failed.",
          retryable: upstream.status >= 500 || upstream.status === 429,
          detail,
          provider_request_id: upstream.headers.get("x-request-id"),
          meta: {
            workspace_id: request.workspace_id,
            workpiece_id: request.workpiece_id,
            client_request_id: request.client_request_id ?? null,
          },
        });
        return;
      }

      stageTimer.mark("openai:response:json:start");
      const payload = (await upstream.json()) as unknown;
      stageTimer.mark("openai:response:json:ok");
      const segments = normalizeSegments(payload);
      if (segments.length === 0) {
        stageTimer.mark("normalize:segments:empty", {}, "warn");
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
        sendTranscriptPrepError(res, {
          status: 502,
          code: "NORMALIZE_EMPTY",
          message: "OpenAI returned a diarized transcript without usable segments.",
          retryable: true,
          provider_request_id: upstream.headers.get("x-request-id"),
          meta: {
            workspace_id: request.workspace_id,
            workpiece_id: request.workpiece_id,
            client_request_id: request.client_request_id ?? null,
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
      stageTimer.mark("normalize:segments:ok", {
        segments: segments.length,
        transcript_text_chars: transcriptText.length,
        provider_request_id: upstream.headers.get("x-request-id"),
      });

      stageTimer.mark("telemetry:ai_usage:start", { model });
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
      stageTimer.mark("telemetry:ai_usage:ok", {
        estimated_cost_usd: accounting.estimatedCostUsd,
        actual_cost_usd: accounting.actualCostUsd,
      });

      stageTimer.mark("response:ok", {
        segments: segments.length,
        provider: "openai",
        model,
        provider_request_id: upstream.headers.get("x-request-id"),
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
      if (res.headersSent) {
        next(error);
        return;
      }
      const rawUrl = req.url || "";
      const origin = `http://${req.headers.host || "localhost"}`;
      const pathname = (() => {
        try {
          return new URL(rawUrl, origin).pathname;
        } catch {
          return "";
        }
      })();
      if (pathname === HAMMER_TRANSCRIPT_PREP_ROUTE) {
        sendTranscriptPrepError(res, {
          status: 500,
          code: "UNKNOWN_ERROR",
          message: error instanceof Error ? error.message : "Hammer prep middleware crashed unexpectedly.",
          retryable: true,
          meta: readPrepMetaFromBody(null),
        });
        return;
      }
      sendJson(res, 500, { ok: false, error: { message: error instanceof Error ? error.message : "Hammer prep middleware crashed unexpectedly." } });
    }
  };
}
