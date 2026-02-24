export type BarStockSpark = {
  id: string;
  createdAt: number;
  updatedAt: number;
  title?: string;
  body: string;
  tags?: string[];
  status?: string;
  links?: {
    hearthDraftId?: string;
    hearthWorkpieceId?: string;
  };
};

const SPARKS_KEY = "barstock_sparks_v1";
const OUTBOX_KEY = "barstock_outbox_v1";

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

function normalizeSpark(value: unknown): BarStockSpark | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  if (!id) return null;
  const body = typeof value.body === "string" ? value.body : "";
  const createdAt = isFiniteNumber(value.createdAt) ? value.createdAt : Date.now();
  const updatedAt = isFiniteNumber(value.updatedAt) ? value.updatedAt : createdAt;
  const title = readString(value.title) ?? undefined;
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
    tags,
    status,
    links,
  };
}

export function readBarStockSparks(): BarStockSpark[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SPARKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeSpark)
      .filter(Boolean)
      .sort((a, b) => b.createdAt - a.createdAt) as BarStockSpark[];
  } catch {
    return [];
  }
}

export function writeBarStockSparks(sparks: BarStockSpark[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SPARKS_KEY, JSON.stringify(sparks));
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

export function isBarStockKey(key: string | null): boolean {
  return key === SPARKS_KEY;
}

export function enqueueBarStockSpark(spark: BarStockSpark): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(OUTBOX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    list.push({ op: "upsert_spark", at: Date.now(), spark });
    window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(list));
  } catch {
    // ignore outbox failures
  }
}
