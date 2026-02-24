import type { HearthPlanningSession, HearthSessionDecision, HearthSessionIntent } from "../domain/hearth-session";
import { HEARTH_SESSION_PATH, HEARTH_SESSION_SCHEMA } from "../domain/hearth-session";
import { resolveWorkspaceId } from "./sources-repo";

type ReadResult<T> = { ok: true; data: T } | { ok: false; status?: number; reason: string };
type CommitResult = { ok: true; skipped?: boolean } | { ok: false; status?: number; reason: string };

type WrittenBy = {
  tool: string;
  tool_version: string;
  lane: string;
};

const DEFAULT_LANE = "forge-managed";
const DEFAULT_TOOL_VERSION = "0.0.0";
let correlationSeq = 0;

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function readNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => readString(entry))
    .filter(Boolean) as string[];
}

function normalizeDecisions(value: unknown): HearthSessionDecision[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const text = readString(entry.text);
      if (!text) return null;
      const at = readString(entry.at) ?? new Date().toISOString();
      return { at, text };
    })
    .filter(Boolean) as HearthSessionDecision[];
}

function normalizeIntent(value: unknown): HearthSessionIntent | null {
  const intent = readString(value);
  if (intent === "new_idea" || intent === "from_spark") return intent;
  return null;
}

function normalizeSession(raw: unknown): HearthPlanningSession | null {
  if (!isRecord(raw)) return null;
  const schema = readString(raw.schema);
  if (schema !== HEARTH_SESSION_SCHEMA) return null;

  const createdAt = readString(raw.created_at) ?? new Date().toISOString();
  const updatedAt = readString(raw.updated_at) ?? createdAt;

  return {
    schema: HEARTH_SESSION_SCHEMA,
    workpiece_id: readNullableString(raw.workpiece_id),
    workspace_id: readNullableString(raw.workspace_id),
    created_at: createdAt,
    updated_at: updatedAt,
    origin: isRecord(raw.origin) ? (raw.origin as HearthPlanningSession["origin"]) : undefined,
    intent: normalizeIntent(raw.intent),
    title: readNullableString(raw.title),
    goals: normalizeStringArray(raw.goals),
    outline: normalizeStringArray(raw.outline),
    audience: readNullableString(raw.audience),
    tone_preset: readNullableString(raw.tone_preset),
    links: isRecord(raw.links) ? (raw.links as HearthPlanningSession["links"]) : undefined,
    decisions: normalizeDecisions(raw.decisions),
  };
}

function resolveApiToken(): string | undefined {
  const w = window as typeof window & {
    __forgeTongsApiToken?: unknown;
    __tpTongsApiToken?: unknown;
  };
  const fromWindow = readString(w.__forgeTongsApiToken ?? w.__tpTongsApiToken);
  if (fromWindow) return fromWindow;
  const metaEnv = import.meta as unknown as { env?: Record<string, string | undefined> };
  const fromEnv = readString(metaEnv.env?.VITE_TONGS_API_TOKEN);
  if (fromEnv) return fromEnv;
  try {
    return readString(window.localStorage.getItem("forge_tongs_api_token_v1")) ?? undefined;
  } catch {
    return undefined;
  }
}

function resolveLane(): string {
  const w = window as typeof window & { __forgeLane?: unknown; __tpLane?: unknown };
  const fromWindow = readString(w.__forgeLane ?? w.__tpLane);
  if (fromWindow) return fromWindow;
  try {
    return readString(window.localStorage.getItem("forge_lane_v1")) ?? DEFAULT_LANE;
  } catch {
    return DEFAULT_LANE;
  }
}

function resolveToolVersion(): string {
  const w = window as typeof window & { APP_VERSION?: unknown };
  const fromWindow = readString(w.APP_VERSION);
  return fromWindow ?? DEFAULT_TOOL_VERSION;
}

function buildWrittenBy(): WrittenBy {
  return {
    tool: "hearth",
    tool_version: resolveToolVersion(),
    lane: resolveLane(),
  };
}

function buildHeaders(apiToken?: string): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiToken) headers.authorization = `Bearer ${apiToken}`;
  return headers;
}

function nextCorrelationId(prefix: string): string {
  correlationSeq += 1;
  return `${prefix}:${Date.now().toString(36)}:${correlationSeq}`;
}

async function readJsonFromTongs(url: string): Promise<ReadResult<unknown>> {
  const headers: Record<string, string> = {};
  const apiToken = resolveApiToken();
  if (apiToken) headers.authorization = `Bearer ${apiToken}`;

  const response = await fetch(url, { headers });
  if (response.status === 404) {
    return { ok: false, status: 404, reason: "not_found" };
  }
  if (!response.ok) {
    return { ok: false, status: response.status, reason: "request_failed" };
  }

  const body = await response.json();
  if (!body || typeof body !== "object" || (body as { ok?: boolean }).ok !== true) {
    return { ok: false, status: response.status, reason: "invalid_response" };
  }

  return { ok: true, data: (body as { data?: unknown }).data };
}

async function postJsonToTongs(url: string, payload: unknown): Promise<ReadResult<unknown>> {
  const apiToken = resolveApiToken();
  const response = await fetch(url, {
    method: "POST",
    headers: buildHeaders(apiToken),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { ok: false, status: response.status, reason: "request_failed" };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    return { ok: false, status: response.status, reason: "invalid_response" };
  }

  if (!body || typeof body !== "object" || (body as { ok?: boolean }).ok !== true) {
    return { ok: false, status: response.status, reason: "invalid_response" };
  }

  return { ok: true, data: (body as { data?: unknown }).data };
}

function isSessionEmpty(session: HearthPlanningSession): boolean {
  const hasTitle = Boolean(session.title && session.title.trim());
  const hasGoals = (session.goals ?? []).length > 0;
  const hasOutline = (session.outline ?? []).length > 0;
  const hasDecisions = (session.decisions ?? []).length > 0;
  const hasAudience = Boolean(session.audience && session.audience.trim());
  const hasTone = Boolean(session.tone_preset && session.tone_preset.trim());
  return !(hasTitle || hasGoals || hasOutline || hasDecisions || hasAudience || hasTone);
}

function deriveIntent(session: HearthPlanningSession): HearthSessionIntent | null {
  if (session.intent) return session.intent;
  const createdFrom = session.origin?.created_from;
  if (createdFrom === "bar-stock") return "from_spark";
  if (createdFrom) return "new_idea";
  return null;
}

function buildSessionDocument(
  session: HearthPlanningSession,
  workspaceId: string,
  workpieceId: string,
): HearthPlanningSession {
  const nowIso = new Date().toISOString();
  const createdAt = session.created_at || nowIso;
  const origin = session.origin ?? null;
  const intent = deriveIntent(session);

  return {
    schema: HEARTH_SESSION_SCHEMA,
    workpiece_id: workpieceId,
    workspace_id: workspaceId,
    created_at: createdAt,
    updated_at: nowIso,
    origin,
    intent,
    title: session.title ?? null,
    goals: session.goals ?? [],
    outline: session.outline ?? [],
    audience: session.audience ?? null,
    tone_preset: session.tone_preset ?? null,
    links: session.links ?? null,
    decisions: session.decisions ?? [],
  };
}

export async function readHearthSession(workpieceId: string): Promise<HearthPlanningSession | null> {
  const url = `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(
    HEARTH_SESSION_PATH,
  )}`;
  const result = await readJsonFromTongs(url);
  if (!result.ok) return null;
  return normalizeSession(result.data);
}

export async function commitHearthSession(
  workpieceId: string,
  session: HearthPlanningSession,
  options?: { allowEmpty?: boolean },
): Promise<CommitResult> {
  const workspaceId = session.workspace_id ?? resolveWorkspaceId();
  if (!workspaceId) return { ok: false, reason: "missing_workspace" };

  const document = buildSessionDocument(session, workspaceId, workpieceId);
  if (!options?.allowEmpty && isSessionEmpty(document)) {
    return { ok: true, skipped: true };
  }

  const payload = {
    path: HEARTH_SESSION_PATH,
    content_type: "application/json",
    json: document,
    written_by: buildWrittenBy(),
    event_name: "hearth.session.v1",
    event_payload: {
      updated_at: document.updated_at,
    },
    correlation_id: nextCorrelationId("hearth-session"),
  };

  const result = await postJsonToTongs(
    `/tongs/workpieces/${encodeURIComponent(workpieceId)}/commit-file`,
    payload,
  );

  if (!result.ok) {
    return { ok: false, status: result.status, reason: result.reason };
  }

  return { ok: true };
}
