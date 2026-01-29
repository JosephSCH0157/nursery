import type { Spark, SparkId } from "./model";

const KEY = "barstock_sparks_v1";

export function loadSparks(): Spark[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Spark[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveSparks(sparks: Spark[]): void {
  localStorage.setItem(KEY, JSON.stringify(sparks));
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
