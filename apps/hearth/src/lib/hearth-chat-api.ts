import {
  HEARTH_AI_ROUTES,
  isHearthAiBehavior as isBehavior,
  isHearthAiLane as isLane,
  normalizeHearthChatMessages as normalizeMessages,
  parseHearthAiStatusResponse,
  parseHearthChatResponse,
  parseHearthSttResponse,
  readHearthAiErrorText as readErrorText,
  readHearthAiRuntimeSnapshot as readRuntimeFromPayload,
  type EpisodeContext,
  type HearthAiBehavior,
  type HearthAiLane,
  type HearthAiRuntimeSnapshot,
  type HearthChatMessage,
  type HearthOp,
  type HearthChatRequest,
  type HearthChatResponse,
  type HearthExplicitUiAction,
  type HearthOutputPreference,
  type HearthTurnResult,
} from "./hearth-ai-runtime-contract";
import type { HearthResearchResult } from "./hearth-research-contract";
import {
  AI_REASON_CODES,
  getAiReasonMessage,
  type AiReasonCode,
} from "@forge/tongs/ai-policy";
import { evaluateHearthScriptValidation, normalizeHearthAiScriptIngress } from "./hearth-script-tag-policy";
import {
  normalizeVisualProviderId,
  type VisualProviderId,
} from "./hearth-visual-provider-profiles";

export type {
  HearthAiBehavior,
  HearthAiLane,
  HearthAiRuntimeSnapshot,
  HearthChatMessage,
  HearthChatRole,
  HearthExplicitUiAction,
  HearthOutputPreference,
  HearthTurnResult,
} from "./hearth-ai-runtime-contract";

export type HearthAiStatusResult =
  | { ok: true; status: number; runtime: HearthAiRuntimeSnapshot }
  | { ok: false; status: number; error: string; runtime: HearthAiRuntimeSnapshot };

export type HearthCustomerBillingQuote = {
  quoteId: string;
  operationId: string;
  quoteHash: string;
  requestFingerprint: string;
  currency: "USD";
  maximumCustomerChargeMicros: number;
  failureCustomerChargeMicros: 0;
  failureTerms: string;
  fundingEligible: boolean;
  fundingSource: "customer_deposit" | "paid_allowance" | "none";
  fundingLabel: string;
  expiresAt: string;
};

export type HearthChatResult =
  | {
      ok: true;
      status: number;
      assistantText: string;
      ops: HearthOp[];
      scriptText?: string;
      tagAudit?: Record<string, unknown>;
      researchResult?: HearthResearchResult;
      gate?: "clarify";
      runtime: HearthAiRuntimeSnapshot;
      totalTokens: number | null;
      creditsWarning?: string;
      billingReceipt?: HearthChatResponse["billing_receipt"];
      turnResult: HearthTurnResult;
    }
  | {
      ok: false;
      status: number;
      error: string;
      runtime: HearthAiRuntimeSnapshot;
      cancelled?: boolean;
      billingReceipt?: HearthChatResponse["billing_receipt"];
      billingQuote?: HearthCustomerBillingQuote;
      turnResult?: HearthTurnResult;
    };

function normalizeCustomerBillingQuote(payload: unknown): HearthCustomerBillingQuote | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const envelope = payload as Record<string, unknown>;
  const raw = envelope.billing_quote;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const quote = raw as Record<string, unknown>;
  const quoteId = typeof quote.quote_id === "string" ? quote.quote_id.trim() : "";
  const operationId = typeof quote.operation_id === "string" ? quote.operation_id.trim() : "";
  const quoteHash = typeof quote.quote_hash === "string" ? quote.quote_hash.trim().toLowerCase() : "";
  const requestFingerprint = typeof quote.request_fingerprint === "string"
    ? quote.request_fingerprint.trim().toLowerCase()
    : "";
  const maximum = Number(quote.maximum_customer_charge_micros);
  const failure = Number(quote.failure_customer_charge_micros);
  const fundingSource = quote.funding_source;
  const expiresAt = typeof quote.expires_at === "string" ? quote.expires_at.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(quoteId) || operationId.length < 8
    || !/^[0-9a-f]{64}$/i.test(quoteHash) || !/^[0-9a-f]{64}$/i.test(requestFingerprint)
    || quote.currency !== "USD" || !Number.isSafeInteger(maximum) || maximum < 0
    || failure !== 0 || !["customer_deposit", "paid_allowance", "none"].includes(String(fundingSource))
    || !expiresAt) return undefined;
  return {
    quoteId,
    operationId,
    quoteHash,
    requestFingerprint,
    currency: "USD",
    maximumCustomerChargeMicros: maximum,
    failureCustomerChargeMicros: 0,
    failureTerms: typeof quote.failure_terms === "string" ? quote.failure_terms : "Failures caused by Forge or its provider cost you $0.",
    fundingEligible: quote.funding_eligible === true,
    fundingSource: fundingSource as HearthCustomerBillingQuote["fundingSource"],
    fundingLabel: typeof quote.funding_label === "string" ? quote.funding_label : "No verified eligible funds",
    expiresAt,
  };
}

export type HearthInteractionEventType =
  | "chat_sent"
  | "gate_questions_shown"
  | "gate_answers_provided"
  | "draft_generated"
  | "outline_generated"
  | "user_requested_outline"
  | "user_requested_script"
  | "user_explicit_draft_now"
  | "proposal_applied"
  | "proposal_discarded";

export type HearthSttUploadResult =
  | {
      ok: true;
      status: number;
      storageKey: string;
      mimeType: string;
      fileSize: number;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export type HearthSttResult =
  | {
      ok: true;
      status: number;
      text: string;
      runtime: HearthAiRuntimeSnapshot;
      providerRequestId: string | null;
      totalTokens: number | null;
      creditsWarning?: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
      runtime: HearthAiRuntimeSnapshot;
      cancelled?: boolean;
      creditsWarning?: string;
    };

const AI_SETTINGS_STORAGE_KEY = "forge:hearth:aiSettings:v1";
const SUPABASE_AUTH_STORAGE_KEY = "forge-auth";
const HEARTH_STT_BUCKET = "forge-workpieces";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AiSettingsSnapshot = {
  lane: HearthAiLane;
  behavior: HearthAiBehavior;
  autoApproveImageSpend: boolean;
  policyTestOverride: "rpc" | "allow" | "soft_deny" | "hard_deny";
  defaultVisualProvider: VisualProviderId;
};

const DEFAULT_AI_SETTINGS: AiSettingsSnapshot = {
  lane: "forge",
  behavior: "careful",
  autoApproveImageSpend: false,
  policyTestOverride: "rpc",
  defaultVisualProvider: "generic",
};

type AiPolicyDecisionType = "ALLOW" | "SOFT_DENY" | "HARD_DENY";
type AiPolicyReasonCode = AiReasonCode;

type AiPolicyResolveRow = {
  decision_type?: unknown;
  reason_code?: unknown;
};

const AI_POLICY_REASON_CODE_SET = new Set<string>(AI_REASON_CODES);

function readStringField(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function isUuid(value: string | null | undefined): value is string {
  if (!value) return false;
  return UUID_RE.test(value.trim());
}

function sanitizeEventPayload(payload?: Record<string, unknown>): Record<string, unknown> {
  if (!payload) return {};
  const out: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(payload)) {
    if (!key.trim()) continue;
    if (typeof rawValue === "boolean") {
      out[key] = rawValue;
      continue;
    }
    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      out[key] = rawValue;
      continue;
    }
    if (typeof rawValue === "string") {
      const compact = rawValue.replace(/\s+/g, " ").trim();
      out[key] = compact.length > 220 ? `${compact.slice(0, 220)}...` : compact;
      continue;
    }
    if (Array.isArray(rawValue)) {
      const arr = rawValue
        .slice(0, 20)
        .map((entry) => (
          typeof entry === "string"
            ? entry.replace(/\s+/g, " ").trim().slice(0, 120)
            : typeof entry === "number" && Number.isFinite(entry)
              ? entry
              : typeof entry === "boolean"
                ? entry
                : null
        ))
        .filter((entry) => entry != null);
      out[key] = arr;
      continue;
    }
    if (rawValue == null) {
      out[key] = null;
    }
  }
  return out;
}

function readSupabaseConfig(): { url: string; anonKey: string } | null {
  const meta = import.meta as unknown as {
    env?: Record<string, string | undefined>;
  };
  const envUrl = meta.env?.VITE_SUPABASE_URL?.trim();
  const envAnonKey = meta.env?.VITE_SUPABASE_ANON_KEY?.trim();
  if (typeof window === "undefined") return envUrl && envAnonKey ? { url: envUrl, anonKey: envAnonKey } : null;

  const runtimeWindow = window as Window & typeof globalThis & {
    __forgeSupabaseUrl?: unknown;
    __forgeSupabaseAnonKey?: unknown;
    __tpSupabaseUrl?: unknown;
    __tpSupabaseAnonKey?: unknown;
    __forge_supabase_client__?: {
      supabaseUrl?: unknown;
      supabaseKey?: unknown;
    };
  };

  const clientUrl = readTokenString(runtimeWindow.__forge_supabase_client__?.supabaseUrl);
  const clientKey = readTokenString(runtimeWindow.__forge_supabase_client__?.supabaseKey);
  if (clientUrl && clientKey) {
    return { url: clientUrl, anonKey: clientKey };
  }

  const globalUrl = readTokenString(runtimeWindow.__forgeSupabaseUrl)
    ?? readTokenString(runtimeWindow.__tpSupabaseUrl);
  const globalAnon = readTokenString(runtimeWindow.__forgeSupabaseAnonKey)
    ?? readTokenString(runtimeWindow.__tpSupabaseAnonKey);
  if (globalUrl && globalAnon) return { url: globalUrl, anonKey: globalAnon };

  if (envUrl && envAnonKey) return { url: envUrl, anonKey: envAnonKey };

  return null;
}

function readTokenString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function decodeBase64Url(input: string): string | null {
  if (!input) return null;
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  try {
    return atob(padded);
  } catch {
    return null;
  }
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const payload = decodeBase64Url(parts[1]);
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readJwtExpiryMs(token: string): number | null {
  const payload = parseJwtPayload(token);
  if (!payload) return null;
  const exp = payload.exp;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
  return Math.trunc(exp * 1000);
}

function isExpiredAccessToken(token: string): boolean {
  const expiryMs = readJwtExpiryMs(token);
  if (!expiryMs) return false;
  return expiryMs <= Date.now() + 5000;
}

function sanitizeAccessToken(token: string | null): string | null {
  if (!token) return null;
  return isExpiredAccessToken(token) ? null : token;
}

function extractAccessTokenFromAuthPayload(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    for (const entry of value) {
      const token = extractAccessTokenFromAuthPayload(entry);
      if (token) return token;
    }
    return null;
  }

  const row = value as Record<string, unknown>;
  const direct = readTokenString(row.access_token);
  if (direct) return sanitizeAccessToken(direct);

  const currentSession = row.currentSession;
  if (currentSession && typeof currentSession === "object") {
    const token = readTokenString((currentSession as Record<string, unknown>).access_token);
    if (token) return sanitizeAccessToken(token);
  }

  const session = row.session;
  if (session && typeof session === "object") {
    const token = readTokenString((session as Record<string, unknown>).access_token);
    if (token) return sanitizeAccessToken(token);
  }

  const currentSessionLegacy = row.current_session;
  if (currentSessionLegacy && typeof currentSessionLegacy === "object") {
    const token = readTokenString((currentSessionLegacy as Record<string, unknown>).access_token);
    if (token) return sanitizeAccessToken(token);
  }

  const nestedData = row.data;
  if (nestedData && typeof nestedData === "object") {
    const token = extractAccessTokenFromAuthPayload(nestedData);
    if (token) return token;
  }

  return null;
}

function readAccessTokenFromStorageKey(key: string): string | null {
  if (typeof window === "undefined") return null;

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;

  const direct = readTokenString(raw);
  if (direct && direct !== "null" && direct !== "undefined" && !direct.startsWith("{") && !direct.startsWith("[")) {
    return sanitizeAccessToken(direct);
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    const token = extractAccessTokenFromAuthPayload(parsed);
    return sanitizeAccessToken(token);
  } catch {
    return null;
  }
}

function readAccessTokenFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  // Authentication is environment-bound. Never borrow a token from another
  // Supabase client's default `sb-...-auth-token` storage key.
  return readAccessTokenFromStorageKey(SUPABASE_AUTH_STORAGE_KEY);
}

async function readAccessTokenForRequest(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  const runtimeWindow = window as Window & typeof globalThis & {
    __forge_supabase_client__?: {
      auth?: {
        getSession?: () => Promise<unknown>;
      };
    };
  };

  const auth = runtimeWindow.__forge_supabase_client__?.auth;
  const getSession = auth?.getSession;
  if (typeof getSession === "function") {
    try {
      const sessionPayload = await getSession.call(auth);
      const token = sanitizeAccessToken(extractAccessTokenFromAuthPayload(sessionPayload));
      if (token) return token;
    } catch {
      // Fall back to persisted auth state when the runtime client is unavailable.
    }
  }

  return readAccessTokenFromStorage();
}

async function buildAuthHeaders(opts?: { includeJson?: boolean }): Promise<Headers> {
  const headers = new Headers();
  if (opts?.includeJson !== false) {
    headers.set("content-type", "application/json");
  }
  const accessToken = await readAccessTokenForRequest();
  if (accessToken) {
    headers.set("authorization", `Bearer ${accessToken}`);
  }
  return headers;
}

function buildSupabaseRpcHeaders(config: { anonKey: string }, accessToken: string): Headers {
  const headers = new Headers();
  headers.set("apikey", config.anonKey);
  headers.set("authorization", `Bearer ${accessToken}`);
  headers.set("accept-profile", "tongs");
  headers.set("content-profile", "tongs");
  headers.set("content-type", "application/json");
  return headers;
}

function readAiPolicyDecisionType(value: unknown): AiPolicyDecisionType | null {
  return value === "ALLOW" || value === "SOFT_DENY" || value === "HARD_DENY"
    ? value
    : null;
}

function readAiPolicyReasonCode(value: unknown): AiPolicyReasonCode | null {
  return typeof value === "string" && AI_POLICY_REASON_CODE_SET.has(value)
    ? (value as AiPolicyReasonCode)
    : null;
}

function readUserIdFromAccessToken(accessToken: string): string | null {
  const payload = parseJwtPayload(accessToken);
  if (!payload) return null;
  const sub = readTokenString(payload.sub);
  if (!sub || !isUuid(sub)) return null;
  return sub;
}

function mapLaneToRequestedMode(lane: HearthAiLane): "PERSONAL_ONLY" | "ORG_FIRST_PERSONAL_FALLBACK" {
  return lane === "byo" ? "PERSONAL_ONLY" : "ORG_FIRST_PERSONAL_FALLBACK";
}

function mapLaneToRequestedFundingSource(
  lane: HearthAiLane,
): "personal_byo_key" | "org_shared_credits" {
  return lane === "byo" ? "personal_byo_key" : "org_shared_credits";
}

function toPreflightErrorMessage(
  reasonCode: AiPolicyReasonCode | null,
  decisionType: AiPolicyDecisionType,
  lane: HearthAiLane,
): string {
  const base = reasonCode ? getAiReasonMessage(reasonCode) : "AI action blocked by policy.";
  if (decisionType === "SOFT_DENY" && lane !== "byo") {
    return `${base} Switch AI lane to BYO in Hearth settings and try again.`;
  }
  return base;
}

async function resolveOrgIdForWorkspace(
  config: { url: string; anonKey: string },
  accessToken: string,
  workspaceId: string | null,
): Promise<string | null> {
  if (!workspaceId || !isUuid(workspaceId)) return null;

  const headers = buildSupabaseRpcHeaders(config, accessToken);
  let response: Response;
  try {
    response = await fetch(
      `${config.url}/rest/v1/workspaces?id=eq.${encodeURIComponent(workspaceId)}&select=org_id`,
      {
        method: "GET",
        headers,
      },
    );
  } catch {
    return null;
  }

  if (!response.ok) return null;

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!Array.isArray(payload) || payload.length === 0) return null;
  const row = payload[0];
  if (!row || typeof row !== "object") return null;
  const orgId = readTokenString((row as Record<string, unknown>).org_id);
  return orgId && isUuid(orgId) ? orgId : null;
}

async function runHearthAiPolicyPreflight(args: {
  lane: HearthAiLane;
  workspaceId: string | null;
  action: "chat" | "stt";
  feature?: "research_flows" | "heavy_tasks" | "image_generation" | null;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const settings = resolveAiSettingsFromStorage();
  const devMode = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;
  if (devMode && settings.policyTestOverride !== "rpc") {
    if (settings.policyTestOverride === "allow") {
      return { ok: true };
    }
    if (settings.policyTestOverride === "soft_deny") {
      return {
        ok: false,
        status: 403,
        error: toPreflightErrorMessage("NO_VALID_FUNDING_SOURCE", "SOFT_DENY", args.lane),
      };
    }
    return {
      ok: false,
      status: 403,
      error: toPreflightErrorMessage("ORG_AI_DISABLED", "HARD_DENY", args.lane),
    };
  }

  const config = readSupabaseConfig();
  const accessToken = await readAccessTokenForRequest();
  if (!config || !accessToken) {
    return {
      ok: false,
      status: 401,
      error: "Sign in required before AI policy preflight can run.",
    };
  }

  const userId = readUserIdFromAccessToken(accessToken);
  if (!userId) {
    return {
      ok: false,
      status: 401,
      error: "Unable to resolve your user session for AI policy preflight.",
    };
  }

  const orgId = await resolveOrgIdForWorkspace(config, accessToken, args.workspaceId);
  const headers = buildSupabaseRpcHeaders(config, accessToken);
  let response: Response;
  try {
    response = await fetch(`${config.url}/rest/v1/rpc/resolve_ai_access_policy`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        p_org_id: orgId,
        p_workspace_id: args.workspaceId && isUuid(args.workspaceId) ? args.workspaceId : null,
        p_user_id: userId,
        p_tool: "hearth",
        p_feature: args.feature ?? null,
        p_action: args.action,
        p_requested_mode: mapLaneToRequestedMode(args.lane),
        p_personal_ai_configured: args.lane === "byo",
        p_org_ai_available: args.lane !== "byo",
        p_requested_funding_source: mapLaneToRequestedFundingSource(args.lane),
        p_write_ledger: true,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network error";
    return {
      ok: false,
      status: 0,
      error: `AI policy preflight failed: ${message}`,
    };
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
      error: readErrorText(payload, `AI policy preflight failed (${response.status}).`),
    };
  }

  const row = Array.isArray(payload) ? (payload[0] as AiPolicyResolveRow | undefined) : undefined;
  const decisionType = readAiPolicyDecisionType(row?.decision_type);
  const reasonCode = readAiPolicyReasonCode(row?.reason_code);
  if (decisionType == null) {
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
      error: toPreflightErrorMessage(reasonCode, decisionType, args.lane),
    };
  }

  return { ok: true };
}

function resolveAiSettingsFromStorage(): AiSettingsSnapshot {
  if (typeof window === "undefined") return DEFAULT_AI_SETTINGS;
  try {
    const raw = window.localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_AI_SETTINGS;
    const parsed = JSON.parse(raw) as {
      lane?: unknown;
      behavior?: unknown;
      autoApproveImageSpend?: unknown;
      policyTestOverride?: unknown;
      defaultVisualProvider?: unknown;
    };
    return {
      lane: isLane(parsed.lane) ? parsed.lane : "forge",
      behavior: isBehavior(parsed.behavior) ? parsed.behavior : "careful",
      autoApproveImageSpend: parsed.autoApproveImageSpend === true,
      policyTestOverride:
        parsed.policyTestOverride === "allow"
        || parsed.policyTestOverride === "soft_deny"
        || parsed.policyTestOverride === "hard_deny"
          ? parsed.policyTestOverride
          : "rpc",
      defaultVisualProvider: normalizeVisualProviderId(parsed.defaultVisualProvider) ?? "generic",
    };
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

export function resolveAiLaneFromStorage(): HearthAiLane {
  return resolveAiSettingsFromStorage().lane;
}

export async function resolveForgeUserAccessToken(): Promise<string | null> {
  return readAccessTokenForRequest();
}

export function resolveAiThumbnailAutoApproveFromStorage(): boolean {
  return resolveAiSettingsFromStorage().autoApproveImageSpend === true;
}

export function resolveDefaultVisualProviderFromStorage(): VisualProviderId {
  return resolveAiSettingsFromStorage().defaultVisualProvider;
}

function parseCreditsPayload(payload: unknown, fallbackLane: HearthAiLane): HearthAiRuntimeSnapshot {
  if (Array.isArray(payload) && payload.length > 0) {
    return readRuntimeFromPayload(payload[0], fallbackLane);
  }
  return readRuntimeFromPayload(payload, fallbackLane);
}

function runtimeFromResponse(payload: {
  billing_mode: HearthAiLane;
  token_balance: number | null;
}): HearthAiRuntimeSnapshot {
  return {
    billingMode: payload.billing_mode,
    tokenBalance: payload.token_balance,
  };
}

function normalizeScriptTextForAnvil(scriptText: string | undefined): string | undefined {
  if (!scriptText?.trim()) return undefined;
  return normalizeHearthAiScriptIngress(scriptText).text;
}

function normalizeScriptBodyOpsForAnvil(ops: HearthOp[]): HearthOp[] {
  return ops.map((op) => {
    if (op.op !== "set_body") return op;
    return {
      ...op,
      value: normalizeHearthAiScriptIngress(op.value).text,
    };
  });
}

export function coalesceScriptTextIntoOps(
  ops: HearthOp[],
  scriptText: string | undefined,
): HearthOp[] {
  const normalizedOps = normalizeScriptBodyOpsForAnvil(ops);
  const normalizedScriptText = normalizeScriptTextForAnvil(scriptText);
  if (!normalizedScriptText) return normalizedOps;
  if (normalizedOps.some((op) => op.op === "set_body")) {
    return normalizedOps.map((op) => (
      op.op === "set_body"
        ? { ...op, value: normalizedScriptText }
        : op
    ));
  }
  return [...normalizedOps, { op: "set_body", value: normalizedScriptText }];
}

function resolveValidatedAssistantScriptCandidate(candidate: string): string | undefined {
  const trimmed = candidate.trim();
  if (!trimmed) return undefined;

  const { normalizedText, tagMode, validation } = evaluateHearthScriptValidation(trimmed);
  if (tagMode !== "present" || !validation.ok) return undefined;
  return normalizedText.trim();
}

function inferScriptTextFromAssistantText(assistantText: string): string | undefined {
  const trimmed = assistantText.trim();
  if (!trimmed) return undefined;

  const directCandidate = resolveValidatedAssistantScriptCandidate(trimmed);
  if (directCandidate) return directCandidate;

  const firstSpeakerOpen = trimmed.match(/\[(?:s\d+|g\d+)\]/i);
  const speakerCloseMatches = [...trimmed.matchAll(/\[\/(?:s\d+|g\d+)\]/ig)];
  const firstSpeakerIndex = firstSpeakerOpen?.index ?? -1;
  const lastSpeakerClose = speakerCloseMatches[speakerCloseMatches.length - 1];
  const lastSpeakerCloseIndex = lastSpeakerClose?.index ?? -1;
  if (firstSpeakerIndex < 0 || lastSpeakerCloseIndex < firstSpeakerIndex || !lastSpeakerClose) {
    return undefined;
  }

  const lastSpeakerCloseEnd = lastSpeakerCloseIndex + lastSpeakerClose[0].length;
  return resolveValidatedAssistantScriptCandidate(trimmed.slice(firstSpeakerIndex, lastSpeakerCloseEnd));
}

export function resolveScriptTextFromChatPayload(args: {
  assistantText: string;
  ops: HearthOp[];
  scriptText: string | undefined;
}): string | undefined {
  if (args.scriptText?.trim()) return args.scriptText;
  if (args.ops.some((op) => op.op === "set_body")) return undefined;
  return inferScriptTextFromAssistantText(args.assistantText);
}

function createStorageObjectPath(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function createClientRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function extensionFromMimeType(mimeType: string): string {
  const normalized = mimeType.trim().toLowerCase();
  if (!normalized) return "webm";
  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("mpeg") || normalized.includes("mp3")) return "mp3";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("mp4") || normalized.includes("m4a")) return "m4a";
  return "webm";
}

function resolveBlobMimeType(blob: Blob): string {
  const trimmed = blob.type?.trim();
  if (trimmed) return trimmed;
  return "audio/webm";
}

function readStorageError(payload: unknown, fallback: string): string {
  const message = readStringField(payload, "message") ?? readStringField(payload, "error");
  if (message && message.trim()) return message;
  return fallback;
}

export async function recordHearthEvent(args: {
  eventType: HearthInteractionEventType;
  payload?: Record<string, unknown>;
  episodeId?: string | null;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const config = readSupabaseConfig();
  if (!config) {
    return {
      ok: false,
      status: 500,
      error: "Supabase config missing.",
    };
  }

  const accessToken = await readAccessTokenForRequest();
  if (!accessToken) {
    return {
      ok: false,
      status: 401,
      error: "Sign in required.",
    };
  }

  const headers = new Headers();
  headers.set("apikey", config.anonKey);
  headers.set("authorization", `Bearer ${accessToken}`);
  headers.set("accept-profile", "tongs");
  headers.set("content-profile", "tongs");
  headers.set("content-type", "application/json");

  const trimmedEpisodeId = args.episodeId?.trim() ?? "";
  const payload = {
    p_event_type: args.eventType,
    p_payload: sanitizeEventPayload(args.payload),
    p_episode_id: isUuid(trimmedEpisodeId) ? trimmedEpisodeId : null,
  };

  let response: Response;
  try {
    response = await fetch(`${config.url}/rest/v1/rpc/record_hearth_event`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network error";
    return {
      ok: false,
      status: 0,
      error: message,
    };
  }

  if (!response.ok) {
    let resultPayload: unknown = null;
    try {
      resultPayload = await response.json();
    } catch {
      resultPayload = null;
    }
    return {
      ok: false,
      status: response.status,
      error: readErrorText(resultPayload, `Event RPC failed (${response.status})`),
    };
  }

  return { ok: true };
}

export async function refreshMyAiCredits(): Promise<HearthAiStatusResult> {
  const lane = resolveAiLaneFromStorage();
  if (lane === "byo") {
    return {
      ok: true,
      status: 200,
      runtime: {
        billingMode: "byo",
        tokenBalance: null,
      },
    };
  }

  const config = readSupabaseConfig();
  const accessToken = await readAccessTokenForRequest();
  if (!config || !accessToken) {
    return {
      ok: false,
      status: 0,
      error: "Unable to refresh credits.",
      runtime: { billingMode: lane, tokenBalance: null },
    };
  }

  let response: Response;
  try {
    response = await fetch(`${config.url}/rest/v1/rpc/get_my_ai_credits`, {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        authorization: `Bearer ${accessToken}`,
        "accept-profile": "tongs",
        "content-profile": "tongs",
        "content-type": "application/json",
      },
      body: "{}",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network error";
    return {
      ok: false,
      status: 0,
      error: message,
      runtime: { billingMode: lane, tokenBalance: null },
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const runtime = parseCreditsPayload(payload, lane);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: readErrorText(payload, `Credits request failed (${response.status})`),
      runtime,
    };
  }

  return {
    ok: true,
    status: response.status,
    runtime,
  };
}

export async function fetchHearthAiStatus(): Promise<HearthAiStatusResult> {
  const credits = await refreshMyAiCredits();
  if (credits.ok) {
    return credits;
  }

  const lane = resolveAiLaneFromStorage();
  const query = new URLSearchParams({ lane });
  let response: Response;

  try {
    response = await fetch(`${HEARTH_AI_ROUTES.chatStatus}?${query.toString()}`, {
      method: "GET",
      headers: await buildAuthHeaders({ includeJson: true }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network error";
    return {
      ok: false,
      status: 0,
      error: message,
      runtime: { tokenBalance: null, billingMode: lane },
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const runtime = runtimeFromResponse(parseHearthAiStatusResponse(payload, lane));

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: readErrorText(payload, `Status request failed (${response.status})`),
      runtime,
    };
  }

  return {
    ok: true,
    status: response.status,
    runtime,
  };
}

export async function uploadHearthSttAudio(args: {
  workpieceId: string;
  blob: Blob;
}): Promise<HearthSttUploadResult> {
  const workpieceId = args.workpieceId.trim();
  if (!workpieceId) {
    return {
      ok: false,
      status: 400,
      error: "Workpiece id is required.",
    };
  }

  const config = readSupabaseConfig();
  if (!config) {
    return {
      ok: false,
      status: 500,
      error: "Supabase config missing for AI transcription.",
    };
  }

  const accessToken = await readAccessTokenForRequest();
  if (!accessToken) {
    return {
      ok: false,
      status: 401,
      error: "Sign in required for AI transcription.",
    };
  }

  const mimeType = resolveBlobMimeType(args.blob);
  const extension = extensionFromMimeType(mimeType);
  const fileName = `${createClientRequestId()}.${extension}`;
  const storageKey = `workpieces/${workpieceId}/stt/${fileName}`;
  const storagePath = createStorageObjectPath([HEARTH_STT_BUCKET, ...storageKey.split("/")]);
  const uploadUrl = `${config.url}/storage/v1/object/${storagePath}`;

  let response: Response;
  try {
    response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        authorization: `Bearer ${accessToken}`,
        "content-type": mimeType,
        "x-upsert": "false",
      },
      body: args.blob,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    return {
      ok: false,
      status: 0,
      error: message,
    };
  }

  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    return {
      ok: false,
      status: response.status,
      error: readStorageError(payload, `Upload failed (${response.status})`),
    };
  }

  return {
    ok: true,
    status: response.status,
    storageKey,
    mimeType,
    fileSize: args.blob.size,
  };
}

export async function requestHearthSttTranscript(args: {
  workpieceId: string;
  storageKey: string;
  mimeType?: string;
  workspaceId?: string | null;
  signal?: AbortSignal;
}): Promise<HearthSttResult> {
  const settings = resolveAiSettingsFromStorage();
  const lane = settings.lane;
  const workpieceId = args.workpieceId.trim();
  const storageKey = args.storageKey.trim();
  const mimeType = args.mimeType?.trim();

  if (!workpieceId || !storageKey) {
    return {
      ok: false,
      status: 400,
      error: "workpieceId and storageKey are required.",
      runtime: { tokenBalance: null, billingMode: lane },
    };
  }

  const preflight = await runHearthAiPolicyPreflight({
    lane,
    workspaceId: args.workspaceId ?? null,
    action: "stt",
    feature: "heavy_tasks",
  });
  if (!preflight.ok) {
    return {
      ok: false,
      status: preflight.status,
      error: preflight.error,
      runtime: { tokenBalance: null, billingMode: lane },
    };
  }

  const accessToken = await readAccessTokenForRequest();
  if (!accessToken) {
    return {
      ok: false,
      status: 401,
      error: "Sign in required for AI transcription.",
      runtime: { tokenBalance: null, billingMode: lane },
    };
  }

  const headers = new Headers();
  headers.set("content-type", "application/json");
  headers.set("authorization", `Bearer ${accessToken}`);

  let response: Response;
  try {
    response = await fetch(HEARTH_AI_ROUTES.stt, {
      method: "POST",
      headers,
      body: JSON.stringify({
        lane,
        workpiece_id: workpieceId,
        storage_key: storageKey,
        ...(mimeType ? { mime_type: mimeType } : {}),
      }),
      signal: args.signal,
    });
  } catch (error) {
    const cancelled = error instanceof DOMException && error.name === "AbortError";
    const message = cancelled
      ? "Transcription cancelled."
      : error instanceof Error
        ? error.message
        : "Network error";
    return {
      ok: false,
      status: 0,
      error: message,
      runtime: { tokenBalance: null, billingMode: lane },
      cancelled,
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const parsed = parseHearthSttResponse(payload, lane);
  const runtime = parsed ? runtimeFromResponse(parsed) : readRuntimeFromPayload(payload, lane);
  const creditsWarning = parsed?.credits_warning ?? undefined;

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: readErrorText(payload, `Transcription failed (${response.status})`),
      runtime,
      creditsWarning,
    };
  }

  const text = parsed?.text ?? "";
  if (!text) {
    return {
      ok: false,
      status: response.status,
      error: "Transcription returned empty text.",
      runtime,
      creditsWarning,
    };
  }

  return {
    ok: true,
    status: response.status,
    text,
    runtime,
    providerRequestId: parsed?.provider_request_id ?? null,
    totalTokens: parsed?.total_tokens ?? null,
    creditsWarning,
  };
}

export async function requestHearthChatReply(
  messages: HearthChatMessage[],
  episodeContext: EpisodeContext,
  options?: {
    signal?: AbortSignal;
    productionAction?: HearthChatRequest["production_action"];
    productionScriptVersion?: number;
    attachmentContext?: {
      includeEpisodeAttachments?: boolean;
      attachmentIds?: string[];
    };
    userAuthoredText?: string;
    explicitAction?: HearthExplicitUiAction;
    outputPreference?: HearthOutputPreference;
    paidExecution?: HearthChatRequest["paid_execution"];
    spendingAcceptance?: HearthChatRequest["spending_acceptance"];
  },
): Promise<HearthChatResult> {
  const normalized = normalizeMessages(messages);
  const settings = resolveAiSettingsFromStorage();
  const lane = settings.lane;
  if (!normalized.length) {
    return {
      ok: false,
      status: 400,
      error: "No messages provided.",
      runtime: { tokenBalance: null, billingMode: lane },
    };
  }

  if (!episodeContext.episodeId.trim()) {
    return {
      ok: false,
      status: 400,
      error: "Episode context is required.",
      runtime: { tokenBalance: null, billingMode: lane },
    };
  }

  const preflight = await runHearthAiPolicyPreflight({
    lane,
    workspaceId: episodeContext.workspaceId,
    action: "chat",
    feature: "research_flows",
  });
  if (!preflight.ok) {
    return {
      ok: false,
      status: preflight.status,
      error: preflight.error,
      runtime: { tokenBalance: null, billingMode: lane },
    };
  }

  const requestPayload: HearthChatRequest = {
    messages: normalized,
    episode_context: episodeContext,
    user_authored_text: options?.userAuthoredText?.trim() || undefined,
    explicit_action: options?.explicitAction,
    output_preference: options?.outputPreference,
    behavior: settings.behavior,
    lane,
    attachment_context: {
      include_episode_attachments: options?.attachmentContext?.includeEpisodeAttachments ?? true,
      attachment_ids: options?.attachmentContext?.attachmentIds,
    },
    production_action: options?.productionAction,
    production_script_version: options?.productionScriptVersion,
    paid_execution: options?.paidExecution,
    spending_acceptance: options?.spendingAcceptance,
  };

  let response: Response;
  try {
    response = await fetch(HEARTH_AI_ROUTES.chat, {
      method: "POST",
      headers: await buildAuthHeaders({ includeJson: true }),
      body: JSON.stringify(requestPayload),
      signal: options?.signal,
    });
  } catch (error) {
    const cancelled = error instanceof DOMException && error.name === "AbortError";
    const message = cancelled
      ? "AI request cancelled."
      : error instanceof Error
        ? error.message
        : "Network error";
    return {
      ok: false,
      status: 0,
      error: message,
      runtime: { tokenBalance: null, billingMode: lane },
      cancelled,
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const parsed = parseHearthChatResponse(payload, lane);
  const runtime = parsed ? runtimeFromResponse(parsed) : readRuntimeFromPayload(payload, lane);
  const billingQuote = normalizeCustomerBillingQuote(payload);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: readErrorText(payload, `Request failed (${response.status})`),
      runtime,
      billingReceipt: parsed?.billing_receipt,
      billingQuote,
      turnResult: parsed?.turn_result,
    };
  }

  if (!parsed) {
    return {
      ok: false,
      status: response.status,
      error: "Hearth returned an invalid response envelope.",
      runtime,
    };
  }
  const turnResult = parsed.turn_result;
  const assistantText = turnResult.assistantMessage;
  const gate = parsed?.gate;
  const rawScriptText = turnResult.artifact?.kind === "script" ? turnResult.artifact.text : undefined;
  const scriptText = normalizeScriptTextForAnvil(rawScriptText);
  const ops = coalesceScriptTextIntoOps(turnResult.operations, scriptText);
  if (!assistantText && ops.length === 0) {
    return {
      ok: false,
      status: response.status,
      error: "Assistant returned an empty reply.",
      runtime,
    };
  }

  return {
    ok: true,
    status: response.status,
    assistantText,
    ops,
    scriptText,
    tagAudit: parsed?.tag_audit ?? undefined,
    researchResult: turnResult.artifact?.kind === "research" ? turnResult.artifact.value : undefined,
    gate,
    runtime,
    totalTokens: parsed?.total_tokens ?? null,
    creditsWarning: parsed?.credits_warning ?? undefined,
    billingReceipt: parsed?.billing_receipt,
    turnResult,
  };
}
