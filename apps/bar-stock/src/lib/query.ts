import type { Spark, SparkStatus } from "./model";

export type SparkQuery = {
  text?: string;              // search in body/title
  tag?: string;               // exact tag match
  status?: SparkStatus | "all";
  pinned?: "all" | "pinned" | "unpinned";
  assignmentId?: string | "all";
};

export function normalizeTag(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, "-");
}

export function extractTags(input: string): string[] {
  // supports: #tag, #two-words (will become two-words), ignores lone '#'
  const matches = input.match(/#[a-zA-Z0-9][\w-]*/g) ?? [];
  const uniq = new Set(matches.map(m => normalizeTag(m.slice(1))));
  return [...uniq].filter(Boolean);
}

export function matchesSpark(s: Spark, q: SparkQuery): boolean {
  if (q.status && q.status !== "all" && s.status !== q.status) return false;

  if (q.pinned === "pinned" && !s.pinned) return false;
  if (q.pinned === "unpinned" && s.pinned) return false;

  if (q.assignmentId && q.assignmentId !== "all" && s.assignmentId !== q.assignmentId) return false;

  if (q.tag) {
    const t = normalizeTag(q.tag);
    if (!s.tags.map(normalizeTag).includes(t)) return false;
  }

  if (q.text && q.text.trim()) {
    const needle = q.text.trim().toLowerCase();
    const hay = `${s.title ?? ""}\n${s.body}`.toLowerCase();
    if (!hay.includes(needle)) return false;
  }

  return true;
}

export function sortSparks(a: Spark, b: Spark): number {
  const ap = a.pinned ? 1 : 0;
  const bp = b.pinned ? 1 : 0;
  if (ap !== bp) return bp - ap;
  return b.updatedAt - a.updatedAt;
}

export function querySparks(sparks: Spark[], q: SparkQuery): Spark[] {
  return sparks.filter(s => matchesSpark(s, q)).sort(sortSparks);
}
