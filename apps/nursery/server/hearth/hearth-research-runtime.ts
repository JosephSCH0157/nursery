import {
  buildEmptyHearthResearchResult,
  type HearthResearchExtractionStatus,
  type HearthResearchRequest,
  type HearthResearchResult,
  type HearthResearchSource,
} from "../../../hearth/src/lib/hearth-research-contract";

export type HearthResearchRuntimeRunArgs = {
  request: HearthResearchRequest;
  workspaceId: string | null;
  workpieceId: string;
  signal?: AbortSignal;
};

export type HearthResearchRuntime = {
  run: (args: HearthResearchRuntimeRunArgs) => Promise<HearthResearchResult>;
};

export type HearthExtractedUrlSourceArgs = {
  url: string;
  sourceId: string;
  signal?: AbortSignal;
};

type HearthResearchRuntimeConfig = {
  braveApiKey?: string | null;
};

type BraveSearchResult = {
  title: string | null;
  url: string;
  domain: string | null;
  snippet: string | null;
  publishedAt: string | null;
};

type FetchOutcome = {
  title: string | null;
  extractedText: string | null;
  extractionStatus: HearthResearchExtractionStatus;
  extractionError: string | null;
};

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const MAX_FETCH_CHARS = 2_400;
const MAX_SNIPPET_CHARS = 320;
const FETCH_TIMEOUT_MS = 8_000;
const DAY_MS = 24 * 60 * 60 * 1000;

function readText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toIsoDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function toIsoFromMs(ms: number): string | null {
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function normalizePublishedAt(value: string | null, nowMs = Date.now()): string | null {
  const raw = readText(value);
  if (!raw) return null;
  const normalized = raw.toLowerCase();

  const strictDateMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (strictDateMatch) {
    const iso = toIsoFromMs(Date.UTC(
      Number.parseInt(strictDateMatch[1] ?? "0", 10),
      Number.parseInt(strictDateMatch[2] ?? "1", 10) - 1,
      Number.parseInt(strictDateMatch[3] ?? "1", 10),
      12,
    ));
    if (iso) return iso;
  }

  const yearMonthMatch = normalized.match(/^(\d{4})-(\d{2})$/);
  if (yearMonthMatch) {
    const iso = toIsoFromMs(Date.UTC(
      Number.parseInt(yearMonthMatch[1] ?? "0", 10),
      Number.parseInt(yearMonthMatch[2] ?? "1", 10) - 1,
      1,
      12,
    ));
    if (iso) return iso;
  }

  if (normalized === "today") {
    return toIsoFromMs(nowMs);
  }
  if (normalized === "yesterday") {
    return toIsoFromMs(nowMs - DAY_MS);
  }

  const agoMatch = normalized.match(/^(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago$/);
  if (agoMatch) {
    const amount = Number.parseInt(agoMatch[1] ?? "0", 10);
    const unit = agoMatch[2] ?? "";
    if (amount > 0) {
      let deltaMs = 0;
      if (unit === "minute") deltaMs = amount * 60 * 1000;
      else if (unit === "hour") deltaMs = amount * 60 * 60 * 1000;
      else if (unit === "day") deltaMs = amount * DAY_MS;
      else if (unit === "week") deltaMs = amount * 7 * DAY_MS;
      else if (unit === "month") deltaMs = amount * 30 * DAY_MS;
      else if (unit === "year") deltaMs = amount * 365 * DAY_MS;
      const iso = toIsoFromMs(nowMs - deltaMs);
      if (iso) return iso;
    }
  }

  const loose = toIsoDate(raw);
  if (!loose) return null;
  const looseMs = Date.parse(loose);
  if (!Number.isFinite(looseMs)) return null;
  if (looseMs > nowMs + (2 * DAY_MS)) return null;
  return loose;
}

function parseDomain(urlString: string): string | null {
  try {
    const url = new URL(urlString);
    return url.hostname || null;
  } catch {
    return null;
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtmlToText(html: string): string {
  const noScript = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ");
  const noTags = noScript.replace(/<[^>]+>/g, " ");
  return compactWhitespace(decodeHtmlEntities(noTags));
}

function extractHtmlTitle(html: string): string | null {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!titleMatch) return null;
  return compactWhitespace(decodeHtmlEntities(titleMatch[1] ?? ""));
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function searchWithBrave(args: {
  apiKey: string;
  request: HearthResearchRequest;
  signal?: AbortSignal;
}): Promise<BraveSearchResult[]> {
  const count = Math.max(3, Math.min(12, args.request.maxSources + 2));
  const url = `${BRAVE_SEARCH_URL}?q=${encodeURIComponent(args.request.query)}&count=${count}&result_filter=web`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": args.apiKey,
    },
    signal: args.signal,
  });
  if (!response.ok) {
    throw new Error(`Brave search returned ${response.status}`);
  }
  const payload = (await response.json()) as Record<string, unknown>;
  const web = payload.web as Record<string, unknown> | undefined;
  const resultsRaw = Array.isArray(web?.results) ? web?.results : [];
  const normalized: BraveSearchResult[] = [];
  for (const row of resultsRaw) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const urlValue = readText(item.url);
    if (!urlValue) continue;
    const domain = parseDomain(urlValue);
    normalized.push({
      title: readText(item.title),
      url: urlValue,
      domain,
      snippet: readText(item.description),
      publishedAt: normalizePublishedAt(readText(item.page_age) ?? readText(item.age)),
    });
  }
  const deduped: BraveSearchResult[] = [];
  const seen = new Set<string>();
  for (const result of normalized) {
    const key = result.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(result);
    if (deduped.length >= args.request.maxSources) break;
  }
  return deduped;
}

async function fetchReadableSource(args: {
  candidate: BraveSearchResult;
  signal?: AbortSignal;
}): Promise<FetchOutcome> {
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), FETCH_TIMEOUT_MS);
  const relayAbort = () => timeoutController.abort();
  args.signal?.addEventListener("abort", relayAbort, { once: true });

  try {
    const response = await fetch(args.candidate.url, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
      },
      redirect: "follow",
      signal: timeoutController.signal,
    });
    if (!response.ok) {
      return {
        title: args.candidate.title,
        extractedText: null,
        extractionStatus: "failed",
        extractionError: `Fetch returned ${response.status}`,
      };
    }
    const contentType = compactWhitespace(response.headers.get("content-type") ?? "").toLowerCase();
    const rawText = await response.text();
    if (!rawText.trim()) {
      return {
        title: args.candidate.title,
        extractedText: null,
        extractionStatus: "failed",
        extractionError: "Response body was empty",
      };
    }

    if (contentType.includes("text/html") || /<!doctype html|<html/i.test(rawText)) {
      const extracted = stripHtmlToText(rawText);
      if (!extracted) {
        return {
          title: extractHtmlTitle(rawText) ?? args.candidate.title,
          extractedText: null,
          extractionStatus: "partial",
          extractionError: "HTML fetched but readable text extraction was empty",
        };
      }
      return {
        title: extractHtmlTitle(rawText) ?? args.candidate.title,
        extractedText: truncate(extracted, MAX_FETCH_CHARS),
        extractionStatus: "extracted",
        extractionError: null,
      };
    }

    if (contentType.includes("text/plain") || contentType.includes("application/json") || contentType === "") {
      const compact = compactWhitespace(rawText);
      if (!compact) {
        return {
          title: args.candidate.title,
          extractedText: null,
          extractionStatus: "partial",
          extractionError: "Plain text body was empty after normalization",
        };
      }
      return {
        title: args.candidate.title,
        extractedText: truncate(compact, MAX_FETCH_CHARS),
        extractionStatus: "extracted",
        extractionError: null,
      };
    }

    return {
      title: args.candidate.title,
      extractedText: null,
      extractionStatus: "skipped",
      extractionError: `Unsupported content type: ${contentType || "unknown"}`,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        title: args.candidate.title,
        extractedText: null,
        extractionStatus: "failed",
        extractionError: "Fetch timed out or was aborted",
      };
    }
    return {
      title: args.candidate.title,
      extractedText: null,
      extractionStatus: "failed",
      extractionError: error instanceof Error ? error.message : "Unknown fetch error",
    };
  } finally {
    clearTimeout(timeout);
    args.signal?.removeEventListener("abort", relayAbort);
  }
}

export async function extractUrlToResearchSource(
  args: HearthExtractedUrlSourceArgs,
): Promise<HearthResearchSource> {
  const candidate: BraveSearchResult = {
    title: null,
    url: args.url,
    domain: parseDomain(args.url),
    snippet: null,
    publishedAt: null,
  };

  const outcome = await fetchReadableSource({ candidate, signal: args.signal });

  return {
    sourceId: args.sourceId,
    title: outcome.title,
    url: candidate.url,
    domain: candidate.domain,
    publishedAt: candidate.publishedAt,
    snippet: candidate.snippet,
    extractedText: outcome.extractedText,
    extractionStatus: outcome.extractionStatus,
    extractionError: outcome.extractionError,
  };
}

function buildSynthesis(args: {
  request: HearthResearchRequest;
  sources: HearthResearchSource[];
  extractionSuccessCount: number;
  extractionFailureCount: number;
}): HearthResearchResult["synthesis"] {
  const uniqueDomains = new Set(
    args.sources.map((source) => source.domain).filter((value): value is string => Boolean(value)),
  );
  const sourceHighlights = args.sources.slice(0, 4).map((source) => {
    const label = source.title ?? source.domain ?? source.url;
    const snippet = source.snippet ? ` ${truncate(source.snippet, 140)}` : "";
    return `${label}.${snippet}`.trim();
  });
  const noDateCount = args.sources.filter((source) => !source.publishedAt).length;
  const uncertainties: string[] = [];
  if (args.extractionFailureCount > 0) {
    uncertainties.push(`${args.extractionFailureCount} source fetch/extraction step(s) were partial, failed, or skipped.`);
  }
  if (noDateCount > 0 && args.request.requireDates) {
    uncertainties.push(`${noDateCount} source(s) are missing published dates in the retrieved metadata.`);
  }
  if (args.sources.length === 0) {
    uncertainties.push("No retrievable web sources were returned for this query.");
  }

  return {
    summary: args.sources.length > 0
      ? `Retrieved ${args.sources.length} source(s) for "${args.request.query}" across ${uniqueDomains.size || 1} domain(s).`
      : `No retrievable web sources found for "${args.request.query}".`,
    keyPoints: sourceHighlights.length
      ? sourceHighlights
      : ["No source highlights available in this pass."],
    uncertainties,
    coverageNote: `Extraction coverage: ${args.extractionSuccessCount}/${args.sources.length} sources extracted.`,
  };
}

function deriveRetrievalOutcome(args: {
  sourceCount: number;
  extractionSuccessCount: number;
  extractionFailureCount: number;
}): { mode: HearthResearchResult["mode"]; runtimeStatus: HearthResearchResult["runtimeStatus"] } {
  if (args.sourceCount <= 0) {
    return { mode: "retrieval_first", runtimeStatus: "no_results" };
  }
  if (args.extractionSuccessCount >= args.sourceCount) {
    return { mode: "retrieval_first", runtimeStatus: "ok" };
  }
  if (args.extractionSuccessCount > 0) {
    return { mode: "partial_retrieval", runtimeStatus: "partial" };
  }
  if (args.extractionFailureCount > 0) {
    return { mode: "partial_retrieval", runtimeStatus: "partial" };
  }
  return { mode: "retrieval_first", runtimeStatus: "partial" };
}

export function createHearthResearchRuntime(config: HearthResearchRuntimeConfig = {}): HearthResearchRuntime {
  const braveApiKey = readText(config.braveApiKey);
  return {
    async run(args): Promise<HearthResearchResult> {
      if (args.signal?.aborted) {
        return buildEmptyHearthResearchResult({
          mode: "knowledge_first",
          runtimeStatus: "error",
          summary: "Research runtime was cancelled before execution.",
        });
      }

      if (!braveApiKey) {
        return {
          ...buildEmptyHearthResearchResult({
            mode: "knowledge_first",
            runtimeStatus: "partial",
            summary: "Research provider is not configured; returning knowledge-first fallback.",
          }),
          synthesis: {
            summary: "No retrieval provider key was configured, so this run stayed in knowledge-first mode.",
            keyPoints: [
              `Query accepted: ${args.request.query}`,
              "Set HEARTH_RESEARCH_API_KEY or BRAVE_SEARCH_API_KEY to enable live source retrieval.",
            ],
            uncertainties: [
              "No live source retrieval was executed in this pass.",
            ],
            coverageNote: "Provider not configured; 0/0 sources extracted.",
          },
        };
      }

      let candidates: BraveSearchResult[];
      try {
        candidates = await searchWithBrave({
          apiKey: braveApiKey,
          request: args.request,
          signal: args.signal,
        });
      } catch (error) {
        if (isAbortError(error)) {
          return buildEmptyHearthResearchResult({
            mode: "knowledge_first",
            runtimeStatus: "error",
            summary: "Research retrieval was cancelled.",
          });
        }
        return {
          ...buildEmptyHearthResearchResult({
            mode: "knowledge_first",
            runtimeStatus: "error",
            summary: "Search provider failed before retrieval could complete.",
          }),
          synthesis: {
            summary: "Search provider returned an error, so no retrieval-backed synthesis was possible.",
            keyPoints: [`Query attempted: ${args.request.query}`],
            uncertainties: [error instanceof Error ? error.message : "Unknown search provider error"],
            coverageNote: "Provider error; 0/0 sources extracted.",
          },
        };
      }

      if (!candidates.length) {
        return {
          ...buildEmptyHearthResearchResult({
            mode: "retrieval_first",
            runtimeStatus: "no_results",
            summary: `No results found for "${args.request.query}".`,
          }),
          synthesis: {
            summary: `No strong retrieval results were found for "${args.request.query}".`,
            keyPoints: ["Try broadening keywords or reducing recency constraints."],
            uncertainties: ["Search provider returned no web candidates for this query."],
            coverageNote: "No candidate sources returned by the search provider.",
          },
        };
      }

      const sources: HearthResearchSource[] = [];
      let extractionSuccessCount = 0;
      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        if (args.signal?.aborted) break;
        const outcome = await fetchReadableSource({
          candidate,
          signal: args.signal,
        });
        if (outcome.extractionStatus === "extracted") {
          extractionSuccessCount += 1;
        }
        sources.push({
          sourceId: `retrieval-${index + 1}`,
          title: outcome.title ?? candidate.title,
          url: candidate.url,
          domain: candidate.domain,
          publishedAt: candidate.publishedAt,
          snippet: candidate.snippet ? truncate(candidate.snippet, MAX_SNIPPET_CHARS) : null,
          extractedText: outcome.extractedText,
          extractionStatus: outcome.extractionStatus,
          extractionError: outcome.extractionError,
        });
      }

      const extractionFailureCount = sources.length - extractionSuccessCount;
      const outcome = deriveRetrievalOutcome({
        sourceCount: sources.length,
        extractionSuccessCount,
        extractionFailureCount,
      });

      return {
        mode: outcome.mode,
        runtimeStatus: outcome.runtimeStatus,
        sources,
        synthesis: buildSynthesis({
          request: args.request,
          sources,
          extractionSuccessCount,
          extractionFailureCount,
        }),
      };
    },
  };
}
