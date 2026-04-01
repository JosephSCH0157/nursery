export type HearthResearchIntent = "news" | "background" | "examples" | "mixed";

export type HearthResearchMode = "knowledge_first" | "retrieval_first" | "partial_retrieval";

export type HearthResearchRuntimeStatus = "ok" | "partial" | "no_results" | "error";

export type HearthResearchExtractionStatus = "pending" | "extracted" | "partial" | "failed" | "skipped";

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
  title: string | null;
  url: string;
  domain: string | null;
  publishedAt: string | null;
  snippet: string | null;
  extractedText: string | null;
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
