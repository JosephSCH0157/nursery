export type BarStockSpark = {
  id: string;
  createdAt: number;
  updatedAt: number;
  title?: string;
  body: string;
  assignmentId?: string;
  tags?: string[];
  status?: string;
  links?: {
    hearthDraftId?: string;
    hearthWorkpieceId?: string;
  };
};

const SPARKS_KEY = "barstock_sparks_v1";
const SPARKS_KEY_PREFIX = "barstock_sparks_v2";
const OUTBOX_KEY = "barstock_outbox_v1";
const OUTBOX_KEY_PREFIX = "barstock_outbox_v2";
const WORKSPACE_STORAGE_KEYS = ["forge_workspace_id_v1", "barstock_workspace_id"] as const;
const WORKSPACE_QUERY_KEYS = ["workspace_id", "workspaceId", "workspace"] as const;
const SPARK_QUERY_KEYS = ["spark_id", "sparkId", "barstock_spark_id"] as const;

type BrowserWindowLike = {
  location: {
    search?: string;
  };
  localStorage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeScope(value: unknown): string | null {
  const str = readString(value);
  return str ? str.toLowerCase() : null;
}

function getBrowserWindow(): BrowserWindowLike | null {
  const candidate = globalThis as typeof globalThis & { window?: BrowserWindowLike };
  return candidate.window ?? null;
}

function resolveWorkspaceScope(workspaceId?: string | null): string | null {
  const explicit = normalizeScope(workspaceId);
  if (explicit) return explicit;
  const browserWindow = getBrowserWindow();
  if (!browserWindow) return null;

  try {
    const params = new URLSearchParams(browserWindow.location.search || "");
    for (const key of WORKSPACE_QUERY_KEYS) {
      const value = normalizeScope(params.get(key));
      if (value) return value;
    }
  } catch {
    // ignore query parsing failures
  }

  for (const key of WORKSPACE_STORAGE_KEYS) {
    try {
      const value = normalizeScope(browserWindow.localStorage.getItem(key));
      if (value) return value;
    } catch {
      // ignore storage failures
    }
  }

  return null;
}

function sparksStorageKey(scope: string | null): string {
  return scope ? `${SPARKS_KEY_PREFIX}:${scope}` : SPARKS_KEY;
}

function outboxStorageKey(scope: string | null): string {
  return scope ? `${OUTBOX_KEY_PREFIX}:${scope}` : OUTBOX_KEY;
}

function parseSparkArray(raw: string | null): BarStockSpark[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed
      .map(normalizeSpark)
      .filter((spark): spark is BarStockSpark => !!spark);
    return dedupeSparksById(normalized).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

function normalizeSpark(value: unknown): BarStockSpark | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  if (!id) return null;
  const body = typeof value.body === "string" ? value.body : "";
  const createdAt = isFiniteNumber(value.createdAt) ? value.createdAt : Date.now();
  const updatedAt = isFiniteNumber(value.updatedAt) ? value.updatedAt : createdAt;
  const title = readString(value.title) ?? undefined;
  const assignmentId = readString(value.assignmentId) ?? undefined;
  const tags = Array.isArray(value.tags)
    ? value.tags.map((tag) => readString(tag)).filter(Boolean) as string[]
    : undefined;
  const status = readString(value.status) ?? undefined;

  let links: BarStockSpark["links"];
  if (isRecord(value.links)) {
    const hearthDraftId = readString(value.links.hearthDraftId) ?? undefined;
    const hearthWorkpieceId = readString(value.links.hearthWorkpieceId) ?? undefined;
    links = hearthDraftId || hearthWorkpieceId
      ? { hearthDraftId, hearthWorkpieceId }
      : undefined;
  }

  return {
    id,
    createdAt,
    updatedAt,
    title,
    body,
    assignmentId,
    tags,
    status,
    links,
  };
}

function compareSparkFreshness(a: BarStockSpark, b: BarStockSpark): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt - b.updatedAt;
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return a.id.localeCompare(b.id);
}

function dedupeSparksById(sparks: BarStockSpark[]): BarStockSpark[] {
  const byId = new Map<string, BarStockSpark>();
  for (const spark of sparks) {
    const existing = byId.get(spark.id);
    if (!existing || compareSparkFreshness(existing, spark) <= 0) {
      byId.set(spark.id, spark);
    }
  }
  return [...byId.values()];
}

export function readBarStockSparks(workspaceId?: string | null): BarStockSpark[] {
  const browserWindow = getBrowserWindow();
  if (!browserWindow) return [];
  const scope = resolveWorkspaceScope(workspaceId);
  if (!scope) return [];

  try {
    return parseSparkArray(browserWindow.localStorage.getItem(sparksStorageKey(scope)));
  } catch {
    return [];
  }
}

export function writeBarStockSparks(sparks: BarStockSpark[], workspaceId?: string | null): void {
  const browserWindow = getBrowserWindow();
  if (!browserWindow) return;
  const scope = resolveWorkspaceScope(workspaceId);
  try {
    browserWindow.localStorage.setItem(sparksStorageKey(scope), JSON.stringify(sparks));
  } catch {
    // ignore storage failures
  }
}

export function upsertBarStockSpark(sparks: BarStockSpark[], spark: BarStockSpark): BarStockSpark[] {
  const idx = sparks.findIndex((item) => item.id === spark.id);
  if (idx === -1) return [spark, ...sparks];
  const next = sparks.slice();
  next[idx] = spark;
  return next;
}

export function isBarStockKey(key: string | null, workspaceId?: string | null): boolean {
  if (!key) return false;
  const scope = resolveWorkspaceScope(workspaceId);
  if (!scope) return false;
  if (!key.startsWith(`${SPARKS_KEY_PREFIX}:`)) return false;
  return key === sparksStorageKey(scope);
}

export function enqueueBarStockSpark(spark: BarStockSpark, workspaceId?: string | null): void {
  const browserWindow = getBrowserWindow();
  if (!browserWindow) return;
  const scope = resolveWorkspaceScope(workspaceId);
  if (!scope) return;
  const key = outboxStorageKey(scope);
  try {
    const raw = browserWindow.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed : [];

    const signature = buildSparkOutboxSignature(spark);
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const op = list[index];
      if (!isRecord(op) || readString(op.op) !== "upsert_spark" || !isRecord(op.spark)) continue;
      const existingSpark = normalizeSpark(op.spark);
      if (!existingSpark || existingSpark.id !== spark.id) continue;

      if (buildSparkOutboxSignature(existingSpark) === signature) {
        return;
      }

      list[index] = { op: "upsert_spark", at: Date.now(), spark };
      browserWindow.localStorage.setItem(key, JSON.stringify(list));
      return;
    }

    list.push({ op: "upsert_spark", at: Date.now(), spark });
    browserWindow.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // ignore outbox failures
  }
}

export function resolveBarstockSparkIdFromQuery(): string | null {
  const browserWindow = getBrowserWindow();
  if (!browserWindow) return null;
  try {
    const params = new URLSearchParams(browserWindow.location.search || "");
    for (const key of SPARK_QUERY_KEYS) {
      const value = readString(params.get(key));
      if (value) return value;
    }
  } catch {
    return null;
  }
  return null;
}

function buildSparkOutboxSignature(spark: BarStockSpark): string {
  const tags = Array.isArray(spark.tags) ? spark.tags.map((tag) => readString(tag) ?? "").filter(Boolean) : [];
  return JSON.stringify({
    id: spark.id,
    title: spark.title ?? null,
    body: spark.body,
    assignmentId: spark.assignmentId ?? null,
    tags,
    status: spark.status ?? null,
    hearthDraftId: spark.links?.hearthDraftId ?? null,
    hearthWorkpieceId: spark.links?.hearthWorkpieceId ?? null,
  });
}
