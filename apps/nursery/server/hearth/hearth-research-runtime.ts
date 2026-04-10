import {
  buildEmptyHearthResearchResult,
  type HearthAttributedQuote,
  type HearthResearchExtractionStatus,
  type HearthResearchRequest,
  type HearthResearchResult,
  type HearthResearchSource,
  type HearthResearchSourceType,
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
  sourceType: HearthResearchSourceType;
  title: string | null;
  publisher: string | null;
  author: string | null;
  resolvedUrl: string | null;
  canonicalUrl: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  extractedText: string | null;
  transcript: string | null;
  attributedQuotes: HearthAttributedQuote[] | null;
  extractionStatus: HearthResearchExtractionStatus;
  extractionError: string | null;
};

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const MAX_FETCH_CHARS = 9_000;
const MAX_SNIPPET_CHARS = 320;
const FETCH_TIMEOUT_MS = 8_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const YOUTUBE_OEMBED_URL = "https://www.youtube.com/oembed";
const YOUTUBE_TIMEDTEXT_URL = "https://www.youtube.com/api/timedtext";
const TWEET_OEMBED_URLS = ["https://publish.twitter.com/oembed", "https://publish.x.com/oembed"];

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

function inferSourceType(urlString: string): HearthResearchSourceType {
  let hostname = "";
  let pathname = "";
  try {
    const parsed = new URL(urlString);
    hostname = parsed.hostname.toLowerCase();
    pathname = parsed.pathname.toLowerCase();
  } catch {
    return "unknown";
  }

  if (hostname === "youtu.be" || hostname.endsWith("youtube.com")) return "youtube_video";
  if (hostname.endsWith("twitter.com") || hostname.endsWith("x.com")) return "tweet";
  if (pathname.includes("/news/") || pathname.includes("/article/")) return "web_article";
  return "web_page";
}

function extractCanonicalUrl(html: string, baseUrl: string): string | null {
  const relCanonical = html.match(/<link[^>]+rel=(?:"|')canonical(?:"|')[^>]*>/i)?.[0] ?? null;
  if (!relCanonical) return null;
  const href = relCanonical.match(/href=(?:"|')([^"']+)(?:"|')/i)?.[1] ?? null;
  if (!href) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractMetaContent(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const meta = html.match(new RegExp(`<meta\\b[^>]*(?:property|name)=(?:"|')${escaped}(?:"|')[^>]*>`, "i"))?.[0] ?? null;
    if (!meta) continue;
    const content = meta.match(/content=(?:"|')([^"']+)(?:"|')/i)?.[1] ?? null;
    const value = content ? readText(decodeHtmlEntities(content)) : null;
    if (value) return value;
  }
  return null;
}

function extractEmbeddedJsonLd(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re = /<script\b[^>]*type=(?:"|')application\/ld\+json(?:"|')[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const raw = match[1];
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try {
      blocks.push(JSON.parse(trimmed));
    } catch {
      // ignore invalid JSON-LD
    }
    if (blocks.length >= 4) break;
  }
  return blocks;
}

function readJsonLdText(value: unknown): string | null {
  if (typeof value === "string") return readText(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (typeof record.name === "string") return readText(record.name);
  }
  return null;
}

function extractJsonLdMeta(html: string): {
  publisher: string | null;
  author: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
} {
  const blocks = extractEmbeddedJsonLd(html);
  let publisher: string | null = null;
  let author: string | null = null;
  let publishedAt: string | null = null;
  let updatedAt: string | null = null;

  for (const block of blocks) {
    const candidates = Array.isArray(block) ? block : [block];
    for (const entry of candidates) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      publisher = publisher ?? readJsonLdText(record.publisher);
      author = author ?? readJsonLdText(record.author);
      publishedAt = publishedAt ?? toIsoDate(readJsonLdText(record.datePublished));
      updatedAt = updatedAt ?? toIsoDate(readJsonLdText(record.dateModified));
    }
  }

  return { publisher, author, publishedAt, updatedAt };
}

function extractArticleHtml(html: string): string | null {
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ?? null;
  if (article) return article;
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? null;
  if (main) return main;
  return null;
}

function coerceIsoFromMeta(value: string | null): string | null {
  const raw = readText(value);
  if (!raw) return null;
  return toIsoDate(raw) ?? normalizePublishedAt(raw);
}

function extractAttributedQuotes(text: string): HearthAttributedQuote[] | null {
  const quotes: HearthAttributedQuote[] = [];
  const patterns = [
    /“([^”]{20,320})”/g,
    /"([^"\n]{20,320})"/g,
  ];
  const seen = new Set<string>();

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const quoteText = readText(match[1]);
      if (!quoteText) continue;
      const key = quoteText.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const index = typeof match.index === "number" ? match.index : 0;
      const start = Math.max(0, index - 220);
      const end = Math.min(text.length, index + quoteText.length + 260);
      const contextWindow = text.slice(start, end);

      let speaker: string | null = null;
      let organization: string | null = null;
      const attributionMatch = contextWindow.match(
        /\b([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,3})(?:,\s*([^.,]{2,80}))?\s+(?:said|told|stated|added|wrote)\b/i,
      );
      if (attributionMatch) {
        speaker = readText(attributionMatch[1]) ?? null;
        organization = readText(attributionMatch[2]) ?? null;
      }

      quotes.push({
        text: quoteText,
        speaker,
        organization,
        context: readText(contextWindow) ?? null,
      });

      if (quotes.length >= 6) break;
    }
    if (quotes.length >= 6) break;
  }

  return quotes.length ? quotes : null;
}

function extractYouTubeVideoId(urlString: string): string | null {
  try {
    const parsed = new URL(urlString);
    const host = parsed.hostname.toLowerCase();
    if (host === "youtu.be") {
      const id = parsed.pathname.replace(/^\/+/, "").split("/")[0] ?? "";
      return id ? id : null;
    }
    if (host.endsWith("youtube.com")) {
      const id = parsed.searchParams.get("v") ?? "";
      return id ? id : null;
    }
  } catch {
    // ignore
  }
  return null;
}

function stripVttToText(vtt: string): string {
  const lines = vtt.split(/\r?\n/);
  const textLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^WEBVTT\b/i.test(trimmed)) continue;
    if (/^\d{2}:\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}\.\d{3}/.test(trimmed)) continue;
    if (/^\d+$/.test(trimmed)) continue;
    textLines.push(trimmed);
  }
  return compactWhitespace(textLines.join(" "));
}

async function fetchYouTubeTranscript(args: {
  url: string;
  signal?: AbortSignal;
}): Promise<string | null> {
  const videoId = extractYouTubeVideoId(args.url);
  if (!videoId) return null;
  const timedText = new URL(YOUTUBE_TIMEDTEXT_URL);
  timedText.searchParams.set("v", videoId);
  timedText.searchParams.set("lang", "en");
  timedText.searchParams.set("fmt", "vtt");

  try {
    const response = await fetch(timedText.toString(), { redirect: "follow", signal: args.signal });
    if (!response.ok) return null;
    const raw = await response.text();
    const stripped = stripVttToText(raw);
    return stripped ? truncate(stripped, MAX_FETCH_CHARS) : null;
  } catch {
    return null;
  }
}

async function fetchYouTubeOEmbed(args: {
  url: string;
  signal?: AbortSignal;
}): Promise<{ title: string | null; author: string | null; publisher: string | null } | null> {
  try {
    const oembed = new URL(YOUTUBE_OEMBED_URL);
    oembed.searchParams.set("url", args.url);
    oembed.searchParams.set("format", "json");
    const response = await fetch(oembed.toString(), { redirect: "follow", signal: args.signal });
    if (!response.ok) return null;
    const payload = (await response.json()) as unknown;
    if (!payload || typeof payload !== "object") return null;
    const record = payload as Record<string, unknown>;
    return {
      title: typeof record.title === "string" ? readText(record.title) : null,
      author: typeof record.author_name === "string" ? readText(record.author_name) : null,
      publisher: typeof record.provider_name === "string" ? readText(record.provider_name) : null,
    };
  } catch {
    return null;
  }
}

async function fetchTweetOEmbed(args: {
  url: string;
  signal?: AbortSignal;
}): Promise<{ author: string | null; publisher: string | null; extractedText: string | null } | null> {
  for (const base of TWEET_OEMBED_URLS) {
    try {
      const endpoint = new URL(base);
      endpoint.searchParams.set("url", args.url);
      endpoint.searchParams.set("omit_script", "1");
      const response = await fetch(endpoint.toString(), { redirect: "follow", signal: args.signal });
      if (!response.ok) continue;
      const payload = (await response.json()) as unknown;
      if (!payload || typeof payload !== "object") continue;
      const record = payload as Record<string, unknown>;
      const author = typeof record.author_name === "string" ? readText(record.author_name) : null;
      const html = typeof record.html === "string" ? record.html : "";
      const extractedText = html ? readText(truncate(stripHtmlToText(html), 1_800)) : null;
      if (!author && !extractedText) continue;
      return {
        author,
        publisher: "X",
        extractedText,
      };
    } catch {
      // try next provider
    }
  }
  return null;
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
    const sourceType = inferSourceType(args.candidate.url);

    if (sourceType === "tweet") {
      const oembed = await fetchTweetOEmbed({ url: args.candidate.url, signal: timeoutController.signal });
      if (oembed?.extractedText) {
        return {
          sourceType,
          title: oembed.author ? `Post by ${oembed.author}` : args.candidate.title,
          publisher: oembed.publisher,
          author: oembed.author,
          resolvedUrl: args.candidate.url,
          canonicalUrl: null,
          publishedAt: normalizePublishedAt(args.candidate.publishedAt),
          updatedAt: null,
          extractedText: oembed.extractedText,
          transcript: null,
          attributedQuotes: extractAttributedQuotes(oembed.extractedText),
          extractionStatus: "extracted",
          extractionError: null,
        };
      }
    }

    const response = await fetch(args.candidate.url, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
      },
      redirect: "follow",
      signal: timeoutController.signal,
    });
    const resolvedUrl = readText(response.url) ?? null;
    if (!response.ok) {
      return {
        sourceType,
        title: args.candidate.title,
        publisher: null,
        author: null,
        resolvedUrl,
        canonicalUrl: null,
        publishedAt: normalizePublishedAt(args.candidate.publishedAt),
        updatedAt: null,
        extractedText: null,
        transcript: null,
        attributedQuotes: null,
        extractionStatus: "failed",
        extractionError: `Fetch returned ${response.status}`,
      };
    }
    const contentType = compactWhitespace(response.headers.get("content-type") ?? "").toLowerCase();
    const rawText = await response.text();
    if (!rawText.trim()) {
      return {
        sourceType,
        title: args.candidate.title,
        publisher: null,
        author: null,
        resolvedUrl,
        canonicalUrl: null,
        publishedAt: normalizePublishedAt(args.candidate.publishedAt),
        updatedAt: null,
        extractedText: null,
        transcript: null,
        attributedQuotes: null,
        extractionStatus: "failed",
        extractionError: "Response body was empty",
      };
    }

    if (contentType.includes("text/html") || /<!doctype html|<html/i.test(rawText)) {
      const canonicalUrl = (resolvedUrl ? extractCanonicalUrl(rawText, resolvedUrl) : null)
        ?? extractCanonicalUrl(rawText, args.candidate.url);
      const jsonLd = extractJsonLdMeta(rawText);
      const metaPublisher = extractMetaContent(rawText, ["og:site_name", "publisher", "application-name"]);
      const metaAuthor = extractMetaContent(rawText, ["author", "article:author"]);
      const metaPublished = extractMetaContent(rawText, ["article:published_time", "published_time", "date", "dc.date", "datePublished", "pubdate"]);
      const metaUpdated = extractMetaContent(rawText, ["article:modified_time", "modified_time", "dateModified", "dc.modified"]);

      const publisher = jsonLd.publisher ?? metaPublisher ?? null;
      const author = jsonLd.author ?? metaAuthor ?? null;
      const publishedAt = jsonLd.publishedAt
        ?? coerceIsoFromMeta(metaPublished)
        ?? normalizePublishedAt(args.candidate.publishedAt);
      const updatedAt = jsonLd.updatedAt ?? coerceIsoFromMeta(metaUpdated);

      const articleHtml = extractArticleHtml(rawText);
      const extracted = stripHtmlToText(articleHtml ?? rawText);
      if (!extracted) {
        return {
          sourceType,
          title: extractHtmlTitle(rawText) ?? args.candidate.title,
          publisher,
          author,
          resolvedUrl,
          canonicalUrl,
          publishedAt,
          updatedAt,
          extractedText: null,
          transcript: null,
          attributedQuotes: null,
          extractionStatus: "partial",
          extractionError: "HTML fetched but readable text extraction was empty",
        };
      }

      const oembed = sourceType === "youtube_video"
        ? await fetchYouTubeOEmbed({ url: args.candidate.url, signal: timeoutController.signal })
        : null;
      const transcript = sourceType === "youtube_video"
        ? await fetchYouTubeTranscript({ url: args.candidate.url, signal: timeoutController.signal })
        : null;
      const extractedText = truncate(extracted, MAX_FETCH_CHARS);
      const attributedQuotes = extractAttributedQuotes(extractedText);
      return {
        sourceType,
        title: oembed?.title ?? extractHtmlTitle(rawText) ?? args.candidate.title,
        publisher: publisher ?? oembed?.publisher ?? null,
        author: author ?? oembed?.author ?? null,
        resolvedUrl,
        canonicalUrl,
        publishedAt,
        updatedAt,
        extractedText,
        transcript,
        attributedQuotes,
        extractionStatus: "extracted",
        extractionError: null,
      };
    }

    if (contentType.includes("text/plain") || contentType.includes("application/json") || contentType === "") {
      const compact = compactWhitespace(rawText);
      if (!compact) {
        return {
          sourceType,
          title: args.candidate.title,
          publisher: null,
          author: null,
          resolvedUrl,
          canonicalUrl: null,
          publishedAt: normalizePublishedAt(args.candidate.publishedAt),
          updatedAt: null,
          extractedText: null,
          transcript: null,
          attributedQuotes: null,
          extractionStatus: "partial",
          extractionError: "Plain text body was empty after normalization",
        };
      }
      return {
        sourceType,
        title: args.candidate.title,
        publisher: null,
        author: null,
        resolvedUrl,
        canonicalUrl: null,
        publishedAt: normalizePublishedAt(args.candidate.publishedAt),
        updatedAt: null,
        extractedText: truncate(compact, MAX_FETCH_CHARS),
        transcript: null,
        attributedQuotes: extractAttributedQuotes(compact),
        extractionStatus: "extracted",
        extractionError: null,
      };
    }

    return {
      sourceType,
      title: args.candidate.title,
      publisher: null,
      author: null,
      resolvedUrl,
      canonicalUrl: null,
      publishedAt: normalizePublishedAt(args.candidate.publishedAt),
      updatedAt: null,
      extractedText: null,
      transcript: null,
      attributedQuotes: null,
      extractionStatus: "skipped",
      extractionError: `Unsupported content type: ${contentType || "unknown"}`,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        sourceType: inferSourceType(args.candidate.url),
        title: args.candidate.title,
        publisher: null,
        author: null,
        resolvedUrl: null,
        canonicalUrl: null,
        publishedAt: normalizePublishedAt(args.candidate.publishedAt),
        updatedAt: null,
        extractedText: null,
        transcript: null,
        attributedQuotes: null,
        extractionStatus: "failed",
        extractionError: "Fetch timed out or was aborted",
      };
    }
    return {
      sourceType: inferSourceType(args.candidate.url),
      title: args.candidate.title,
      publisher: null,
      author: null,
      resolvedUrl: null,
      canonicalUrl: null,
      publishedAt: normalizePublishedAt(args.candidate.publishedAt),
      updatedAt: null,
      extractedText: null,
      transcript: null,
      attributedQuotes: null,
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
  const retrievedAt = new Date().toISOString();
  const candidate: BraveSearchResult = {
    title: null,
    url: args.url,
    domain: parseDomain(args.url),
    snippet: null,
    publishedAt: null,
  };

  const outcome = await fetchReadableSource({ candidate, signal: args.signal });
  const bestUrl = outcome.canonicalUrl ?? outcome.resolvedUrl ?? candidate.url;
  const domain = parseDomain(bestUrl) ?? candidate.domain;

  return {
    sourceId: args.sourceId,
    sourceType: outcome.sourceType,
    title: outcome.title,
    publisher: outcome.publisher,
    author: outcome.author,
    url: bestUrl,
    originalUrl: candidate.url,
    resolvedUrl: outcome.resolvedUrl,
    canonicalUrl: outcome.canonicalUrl,
    domain,
    publishedAt: outcome.publishedAt,
    updatedAt: outcome.updatedAt,
    retrievedAt,
    snippet: candidate.snippet,
    extractedText: outcome.extractedText,
    transcript: outcome.transcript,
    attributedQuotes: outcome.attributedQuotes,
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
        const retrievedAt = new Date().toISOString();
        const outcome = await fetchReadableSource({
          candidate,
          signal: args.signal,
        });
        if (outcome.extractionStatus === "extracted") {
          extractionSuccessCount += 1;
        }
        const bestUrl = outcome.canonicalUrl ?? outcome.resolvedUrl ?? candidate.url;
        const domain = parseDomain(bestUrl) ?? candidate.domain;
        sources.push({
          sourceId: `retrieval-${index + 1}`,
          title: outcome.title ?? candidate.title,
          sourceType: outcome.sourceType,
          publisher: outcome.publisher,
          author: outcome.author,
          url: bestUrl,
          originalUrl: candidate.url,
          resolvedUrl: outcome.resolvedUrl,
          canonicalUrl: outcome.canonicalUrl,
          domain,
          publishedAt: outcome.publishedAt ?? normalizePublishedAt(candidate.publishedAt),
          updatedAt: outcome.updatedAt,
          retrievedAt,
          snippet: candidate.snippet ? truncate(candidate.snippet, MAX_SNIPPET_CHARS) : null,
          extractedText: outcome.extractedText,
          transcript: outcome.transcript,
          attributedQuotes: outcome.attributedQuotes,
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
