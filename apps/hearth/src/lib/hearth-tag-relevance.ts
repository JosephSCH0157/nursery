/**
 * Lightweight deterministic tag relevance scoring.
 * No AI calls, no async. Pure functions.
 */

export type TagRelevanceContext = {
  body: string;
  titleTexts: string[];
};

/** Counts non-overlapping case-insensitive occurrences of `term` in `text`. */
function countOccurrences(term: string, text: string): number {
  if (!term || !text) return 0;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escaped, "gi");
  return (text.match(re) ?? []).length;
}

/**
 * Scores a tag by relevance to the provided episode context.
 * Returns a non-negative integer — higher is more relevant.
 *
 * Scoring:
 *   - 3 pts per occurrence in body (capped at 15)
 *   - 5 pts if tag text appears in any title
 */
export function scoreTagRelevance(tag: string, context: TagRelevanceContext): number {
  const lowerTag = tag.toLowerCase();

  const bodyScore = Math.min(
    countOccurrences(lowerTag, context.body.toLowerCase()) * 3,
    15,
  );

  const titleScore = context.titleTexts.some((t) =>
    t.toLowerCase().includes(lowerTag),
  )
    ? 5
    : 0;

  return bodyScore + titleScore;
}

/**
 * Returns a copy of `tags` sorted by relevance descending.
 * Tags with equal scores preserve their original relative order (stable sort).
 */
export function sortTagsByRelevance(
  tags: string[],
  context: TagRelevanceContext,
): string[] {
  const scored = tags.map((tag, i) => ({
    tag,
    score: scoreTagRelevance(tag, context),
    i,
  }));
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.map((s) => s.tag);
}
