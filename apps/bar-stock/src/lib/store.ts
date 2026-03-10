import type { Spark, SparkId } from "./model";

const KEY = "barstock_sparks_v1";
const KEY_PREFIX = "barstock_sparks_v2";

function normalizedScope(workspaceId?: string | null): string | null {
  const trimmed = typeof workspaceId === "string" ? workspaceId.trim().toLowerCase() : "";
  return trimmed || null;
}

function scopedKey(workspaceId?: string | null): string {
  const scope = normalizedScope(workspaceId);
  return scope ? `${KEY_PREFIX}:${scope}` : KEY;
}

function parseSparks(raw: string | null): Spark[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Spark[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadSparks(workspaceId?: string | null): Spark[] {
  const key = scopedKey(workspaceId);
  const scoped = parseSparks(localStorage.getItem(key));
  if (normalizedScope(workspaceId)) return scoped;
  if (key === KEY) return scoped;
  return parseSparks(localStorage.getItem(KEY));
}

export function saveSparks(sparks: Spark[], workspaceId?: string | null): void {
  localStorage.setItem(scopedKey(workspaceId), JSON.stringify(sparks));
}

export function upsertSpark(sparks: Spark[], spark: Spark): Spark[] {
  const idx = sparks.findIndex(s => s.id === spark.id);
  if (idx === -1) return [spark, ...sparks];
  const next = sparks.slice();
  next[idx] = spark;
  return next;
}

export function removeSpark(sparks: Spark[], id: SparkId): Spark[] {
  return sparks.filter(s => s.id !== id);
}
