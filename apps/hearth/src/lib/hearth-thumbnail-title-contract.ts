export const HEARTH_THUMBNAIL_TITLE_CONTRACT = {
  preferred_max_words: 4,
  hard_max_words: 6,
} as const;

type ThumbnailWordToken = {
  raw: string;
  normalized: string;
};

const THUMBNAIL_TITLE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "with",
]);

const THUMBNAIL_TITLE_LEADING_HOOK_WORDS = new Set([
  "how",
  "what",
  "when",
  "where",
  "who",
  "why",
]);

function tokenizeThumbnailText(value: string): ThumbnailWordToken[] {
  return value
    .trim()
    .split(/\s+/)
    .map((raw) => ({
      raw: raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9?!]+$/g, ""),
      normalized: raw.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""),
    }))
    .filter((token) => token.normalized.length > 0 && token.raw.length > 0);
}

function joinTokens(tokens: ThumbnailWordToken[]): string {
  return tokens
    .map((token) => token.raw)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function countHearthThumbnailTitleWords(value: string): number {
  return tokenizeThumbnailText(value).length;
}

export function deriveHearthThumbnailOverlayText(value: string): string {
  const sourceTokens = tokenizeThumbnailText(value);
  if (sourceTokens.length <= HEARTH_THUMBNAIL_TITLE_CONTRACT.preferred_max_words) {
    return joinTokens(sourceTokens);
  }

  let candidateTokens = sourceTokens.filter((token) => !THUMBNAIL_TITLE_STOP_WORDS.has(token.normalized));
  if (candidateTokens.length === 0) {
    candidateTokens = [...sourceTokens];
  }

  if (
    candidateTokens.length > HEARTH_THUMBNAIL_TITLE_CONTRACT.preferred_max_words
    && THUMBNAIL_TITLE_LEADING_HOOK_WORDS.has(candidateTokens[0]?.normalized ?? "")
  ) {
    candidateTokens = candidateTokens.slice(1);
  }

  if (candidateTokens.length === 0) {
    candidateTokens = [...sourceTokens];
  }

  return joinTokens(candidateTokens.slice(0, HEARTH_THUMBNAIL_TITLE_CONTRACT.preferred_max_words));
}

export function resolveHearthThumbnailOverlayText(args: {
  text: string;
  thumbnail_text?: string | null;
}): string {
  const explicit = typeof args.thumbnail_text === "string" ? args.thumbnail_text.trim() : "";
  if (explicit) {
    return explicit;
  }
  return deriveHearthThumbnailOverlayText(args.text);
}
