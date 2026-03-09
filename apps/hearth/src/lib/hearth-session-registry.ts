import type {
  HearthPlanningSession,
  HearthSessionDecision,
  HearthSessionIntent,
  HearthSessionLinks,
  HearthSessionOrigin,
  HearthTitleVariants,
} from "../domain/hearth-session";
import { HEARTH_SESSION_SCHEMA } from "../domain/hearth-session";

const SESSION_PREFIX = "hearth:script:session:v2:";
const SESSION_FALLBACK_KEY = "hearth:script:session:v2";
const SESSION_FALLBACK_PREFIX = "hearth:script:session:v2:workspace:";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function normalizeUuid(value: unknown): string | null {
  const text = readNullableString(value);
  if (!text) return null;
  return UUID_RE.test(text) ? text.toLowerCase() : null;
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

function normalizeOrigin(value: unknown): HearthSessionOrigin | null {
  if (!isRecord(value)) return null;
  const createdFrom = readString(value.created_from);
  const sparkId = readNullableString(value.spark_id);
  const out: HearthSessionOrigin = {};
  if (createdFrom === "bar-stock" || createdFrom === "scratch" || createdFrom === "hearth") {
    out.created_from = createdFrom;
  }
  if (sparkId) out.spark_id = sparkId;
  return Object.keys(out).length ? out : null;
}

function normalizeLinks(value: unknown): HearthSessionLinks | null {
  if (!isRecord(value)) return null;
  const sparkId = readNullableString(value.spark_id);
  const sourceIds = normalizeStringArray(value.source_ids);
  const out: HearthSessionLinks = {};
  if (sparkId) out.spark_id = sparkId;
  if (sourceIds.length) out.source_ids = sourceIds;
  return Object.keys(out).length ? out : null;
}

function normalizeDecision(value: unknown): HearthSessionDecision | null {
  if (!isRecord(value)) return null;
  const text = readString(value.text);
  if (!text) return null;
  const at = readString(value.at) ?? new Date().toISOString();
  return { at, text };
}

function normalizeDecisions(value: unknown): HearthSessionDecision[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeDecision).filter(Boolean) as HearthSessionDecision[];
}

function normalizeIntent(value: unknown): HearthSessionIntent | null {
  const intent = readString(value);
  if (intent === "new_idea" || intent === "from_spark") return intent;
  return null;
}

function normalizeTitleVariants(value: unknown): HearthTitleVariants | null {
  if (!isRecord(value)) return null;
  const A = readNullableString(value.A) ?? undefined;
  const B = readNullableString(value.B) ?? undefined;
  const C = readNullableString(value.C) ?? undefined;
  if (!A && !B && !C) return null;
  return {
    A,
    B,
    C,
  };
}

function normalizeSession(raw: unknown): HearthPlanningSession | null {
  if (!isRecord(raw)) return null;
  const schema = readString(raw.schema);
  if (schema !== HEARTH_SESSION_SCHEMA) return null;

  const createdAt = readString(raw.created_at) ?? new Date().toISOString();
  const updatedAt = readString(raw.updated_at) ?? createdAt;

  const session: HearthPlanningSession = {
    schema: HEARTH_SESSION_SCHEMA,
    workpiece_id: normalizeUuid(raw.workpiece_id),
    workspace_id: normalizeUuid(raw.workspace_id),
    created_at: createdAt,
    updated_at: updatedAt,
    origin: normalizeOrigin(raw.origin),
    intent: normalizeIntent(raw.intent),
    title: readNullableString(raw.title),
    title_variants: normalizeTitleVariants(raw.title_variants),
    goals: normalizeStringArray(raw.goals),
    outline: normalizeStringArray(raw.outline),
    audience: readNullableString(raw.audience),
    tone_preset: readNullableString(raw.tone_preset),
    links: normalizeLinks(raw.links),
    decisions: normalizeDecisions(raw.decisions),
  };

  return session;
}

function resolveFallbackKey(workspaceId?: string | null): string {
  const workspace = normalizeUuid(workspaceId);
  if (workspace) return `${SESSION_FALLBACK_PREFIX}${workspace}`;
  return SESSION_FALLBACK_KEY;
}

function resolveKey(workpieceId?: string | null, workspaceId?: string | null): string {
  const workpiece = normalizeUuid(workpieceId);
  if (workpiece) return `${SESSION_PREFIX}${workpiece}`;
  return resolveFallbackKey(workspaceId);
}

function readLocalStorage(key: string): string | null {
  try {
    return readString(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

function readJson(key: string): unknown {
  const raw = readLocalStorage(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function readHearthPlanningSessionCache(
  workpieceId?: string | null,
  workspaceId?: string | null,
): HearthPlanningSession | null {
  if (typeof window === "undefined") return null;
  const key = resolveKey(workpieceId, workspaceId);
  const raw = readJson(key);
  const normalized = normalizeSession(raw);
  if (normalized) return normalized;
  const fallbackKey = resolveFallbackKey(workspaceId);
  if (key !== fallbackKey) {
    const fallback = normalizeSession(readJson(fallbackKey));
    if (fallback) return fallback;
  }
  return null;
}

export function writeHearthPlanningSessionCache(
  session: HearthPlanningSession,
  workpieceId?: string | null,
  workspaceId?: string | null,
): void {
  if (typeof window === "undefined") return;
  try {
    const key = resolveKey(workpieceId ?? session.workpiece_id ?? null, workspaceId ?? session.workspace_id ?? null);
    window.localStorage.setItem(key, JSON.stringify(session));
  } catch {
    // ignore
  }
}

export function isHearthPlanningSessionKey(key: string | null): boolean {
  if (!key) return true;
  if (key === SESSION_FALLBACK_KEY) return true;
  if (key.startsWith(SESSION_FALLBACK_PREFIX)) return true;
  if (key.startsWith(SESSION_PREFIX)) return true;
  return false;
}
