export type HearthResearchIntent = "news" | "background" | "examples" | "mixed";

export type HearthResearchMode = "knowledge_first" | "retrieval_first" | "partial_retrieval";

export type HearthResearchRuntimeStatus = "ok" | "partial" | "no_results" | "error";

export type HearthResearchExtractionStatus = "pending" | "extracted" | "partial" | "failed" | "skipped";

export type HearthResearchSourceType = "web_page" | "web_article" | "youtube_video" | "tweet" | "unknown";

export type HearthAttributedQuote = {
  text: string;
  speaker: string | null;
  organization: string | null;
  context: string | null;
};

export type HearthResearchRequest = {
  query: string;
  intent: HearthResearchIntent;
  recencyPreference: "none" | "recent" | "strict_recent";
  maxSources: number;
  requireDates: boolean;
  requireFullExtraction: boolean;
};

export type HearthResearchSource = {
  sourceId: string;
  sourceType?: HearthResearchSourceType | null;
  title: string | null;
  publisher?: string | null;
  author?: string | null;
  url: string;
  originalUrl?: string | null;
  resolvedUrl?: string | null;
  canonicalUrl?: string | null;
  domain: string | null;
  publishedAt: string | null;
  updatedAt?: string | null;
  retrievedAt?: string | null;
  snippet: string | null;
  extractedText: string | null;
  transcript?: string | null;
  attributedQuotes?: HearthAttributedQuote[] | null;
  extractionStatus: HearthResearchExtractionStatus;
  extractionError: string | null;
};

export type HearthResearchSynthesis = {
  summary: string;
  keyPoints: string[];
  uncertainties: string[];
  coverageNote: string;
};

export type HearthResearchResult = {
  mode: HearthResearchMode;
  runtimeStatus: HearthResearchRuntimeStatus;
  sources: HearthResearchSource[];
  synthesis: HearthResearchSynthesis;
};

export const HEARTH_RESEARCH_DEFAULT_MAX_SOURCES = 6;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function buildHearthResearchRequest(input: {
  query: string;
  intent?: HearthResearchIntent | null;
  recencyPreference?: HearthResearchRequest["recencyPreference"] | null;
  maxSources?: number | null;
  requireDates?: boolean | null;
  requireFullExtraction?: boolean | null;
}): HearthResearchRequest {
  const rawQuery = input.query.trim();
  const boundedSourceCount = Number.isFinite(input.maxSources)
    ? Math.max(1, Math.min(12, Math.floor(input.maxSources as number)))
    : HEARTH_RESEARCH_DEFAULT_MAX_SOURCES;
  return {
    query: rawQuery,
    intent: input.intent ?? inferHearthResearchIntent(rawQuery),
    recencyPreference: input.recencyPreference ?? inferHearthResearchRecency(rawQuery),
    maxSources: boundedSourceCount,
    requireDates: input.requireDates ?? /\b(today|latest|recent|this week|this month|timeline|when)\b/i.test(rawQuery),
    requireFullExtraction: input.requireFullExtraction ?? false,
  };
}

export function buildEmptyHearthResearchResult(input: {
  mode: HearthResearchMode;
  runtimeStatus: HearthResearchRuntimeStatus;
  summary: string;
}): HearthResearchResult {
  return {
    mode: input.mode,
    runtimeStatus: input.runtimeStatus,
    sources: [],
    synthesis: {
      summary: input.summary,
      keyPoints: [],
      uncertainties: [],
      coverageNote: "No sources were extracted in this pass.",
    },
  };
}

function inferHearthResearchIntent(query: string): HearthResearchIntent {
  const normalized = query.toLowerCase();
  if (/\bexample|examples|case study|incident|reporting\b/.test(normalized)) return "examples";
  if (/\bnews|latest|today|breaking\b/.test(normalized)) return "news";
  if (/\bbackground|history|explainer|what is|why\b/.test(normalized)) return "background";
  return "mixed";
}

function inferHearthResearchRecency(query: string): HearthResearchRequest["recencyPreference"] {
  const normalized = query.toLowerCase();
  if (/\btoday|this week|this month|latest|breaking\b/.test(normalized)) return "strict_recent";
  if (/\brecent|new|current\b/.test(normalized)) return "recent";
  return "none";
}

export function normalizeHearthResearchResult(value: unknown): HearthResearchResult | null {
  if (!isRecord(value)) return null;
  const mode = value.mode;
  const runtimeStatus = value.runtimeStatus;
  const sources = Array.isArray(value.sources) ? value.sources : [];
  const synthesis = isRecord(value.synthesis) ? value.synthesis : null;
  if (
    mode !== "knowledge_first"
    && mode !== "retrieval_first"
    && mode !== "partial_retrieval"
  ) {
    return null;
  }
  if (
    runtimeStatus !== "ok"
    && runtimeStatus !== "partial"
    && runtimeStatus !== "no_results"
    && runtimeStatus !== "error"
  ) {
    return null;
  }
  const normalizedSources: HearthResearchSource[] = [];
  for (const item of sources) {
    if (!isRecord(item)) continue;
    const extractionStatus = item.extractionStatus;
    if (
      extractionStatus !== "pending"
      && extractionStatus !== "extracted"
      && extractionStatus !== "partial"
      && extractionStatus !== "failed"
      && extractionStatus !== "skipped"
    ) {
      continue;
    }
    const sourceId = typeof item.sourceId === "string" ? item.sourceId.trim() : "";
    const url = typeof item.url === "string" ? item.url.trim() : "";
    if (!sourceId || !url) continue;

    const sourceTypeRaw = typeof item.sourceType === "string" ? item.sourceType.trim() : "";
    const sourceType: HearthResearchSourceType | null = (
      sourceTypeRaw === "web_page"
      || sourceTypeRaw === "web_article"
      || sourceTypeRaw === "youtube_video"
      || sourceTypeRaw === "tweet"
      || sourceTypeRaw === "unknown"
    ) ? sourceTypeRaw : null;

    const quotesRaw = Array.isArray(item.attributedQuotes) ? item.attributedQuotes : null;
    const quotes: HearthAttributedQuote[] | null = quotesRaw
      ? quotesRaw
        .map((quote) => {
          if (!isRecord(quote)) return null;
          const text = typeof quote.text === "string" ? quote.text.trim() : "";
          if (!text) return null;
          return {
            text,
            speaker: typeof quote.speaker === "string" ? quote.speaker : null,
            organization: typeof quote.organization === "string" ? quote.organization : null,
            context: typeof quote.context === "string" ? quote.context : null,
          };
        })
        .filter((quote): quote is HearthAttributedQuote => Boolean(quote))
      : null;
    normalizedSources.push({
      sourceId,
      ...(sourceType ? { sourceType } : {}),
      title: typeof item.title === "string" ? item.title : null,
      publisher: typeof item.publisher === "string" ? item.publisher : null,
      author: typeof item.author === "string" ? item.author : null,
      url,
      originalUrl: typeof item.originalUrl === "string" ? item.originalUrl : null,
      resolvedUrl: typeof item.resolvedUrl === "string" ? item.resolvedUrl : null,
      canonicalUrl: typeof item.canonicalUrl === "string" ? item.canonicalUrl : null,
      domain: typeof item.domain === "string" ? item.domain : null,
      publishedAt: typeof item.publishedAt === "string" ? item.publishedAt : null,
      updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : null,
      retrievedAt: typeof item.retrievedAt === "string" ? item.retrievedAt : null,
      snippet: typeof item.snippet === "string" ? item.snippet : null,
      extractedText: typeof item.extractedText === "string" ? item.extractedText : null,
      transcript: typeof item.transcript === "string" ? item.transcript : null,
      attributedQuotes: quotes,
      extractionStatus,
      extractionError: typeof item.extractionError === "string" ? item.extractionError : null,
    });
  }
  const normalizedSynthesis: HearthResearchSynthesis = {
    summary: synthesis && typeof synthesis.summary === "string" ? synthesis.summary : "",
    keyPoints: synthesis && Array.isArray(synthesis.keyPoints)
      ? synthesis.keyPoints.filter((entry): entry is string => typeof entry === "string")
      : [],
    uncertainties: synthesis && Array.isArray(synthesis.uncertainties)
      ? synthesis.uncertainties.filter((entry): entry is string => typeof entry === "string")
      : [],
    coverageNote: synthesis && typeof synthesis.coverageNote === "string" ? synthesis.coverageNote : "",
  };
  return {
    mode,
    runtimeStatus,
    sources: normalizedSources,
    synthesis: normalizedSynthesis,
  };
}
