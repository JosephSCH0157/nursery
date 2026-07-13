import type { Spark, SparkId } from "./model";

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
