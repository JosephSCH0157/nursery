import {
  buildEmptyHearthResearchResult,
  type HearthAttributedQuote,
  type HearthResearchIngestMode,
  type HearthResearchExtractionStatus,
  type HearthResearchRequest,
  type HearthResearchResult,
  type HearthResearchSource,
  type HearthResearchBrief,
  type HearthResearchEvidence,
  type HearthResearchSourceAuthority,
  type HearthResearchAccessFailureReason,
  type HearthResearchSourceProvenance,
  type HearthResearchSourceType,
  type HearthTranscriptMeta,
  type HearthTranscriptSegment,
} from "../../../hearth/src/lib/hearth-research-contract";

export type HearthResearchRuntimeRunArgs = {
  request: HearthResearchRequest;
  brief: HearthResearchBrief;
  sourceOrigin?: "search" | "creator_url";
  signal?: AbortSignal;
};

export type HearthResearchRuntime = {
  run: (args: HearthResearchRuntimeRunArgs) => Promise<HearthResearchResult>;
};

export type HearthExtractedUrlSourceArgs = {
  url: string;
  sourceId: string;
  brief: HearthResearchBrief;
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
  ingestMode: HearthResearchIngestMode | null;
  title: string | null;
  publisher: string | null;
  author: string | null;
  resolvedUrl: string | null;
  canonicalUrl: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  warnings: string[];
  transcriptAvailable: boolean;
  extractedText: string | null;
  transcript: string | null;
  transcriptSegments: HearthTranscriptSegment[] | null;
  transcriptMeta: HearthTranscriptMeta | null;
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

function canonicalizeResearchUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^(?:utm_|fbclid|gclid|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString().replace(/\?$/, "").toLowerCase();
  } catch {
    return compactWhitespace(value).toLowerCase();
  }
}

function normalizeSourceIdentity(value: string | null | undefined): string {
  return compactWhitespace(String(value ?? ""))
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function dedupeHearthResearchSources(sources: HearthResearchSource[]): HearthResearchSource[] {
  const deduped: HearthResearchSource[] = [];
  const seenUrls = new Set<string>();
  const seenIdentities = new Set<string>();
  for (const source of sources) {
    const urlKey = canonicalizeResearchUrl(source.canonicalUrl || source.resolvedUrl || source.url);
    const identity = normalizeSourceIdentity(source.publisher || source.title);
    const domain = String(source.domain || parseDomain(source.url) || "").toLowerCase();
    const identityKey = identity ? `${domain}|${identity}` : "";
    if ((urlKey && seenUrls.has(urlKey)) || (identityKey && seenIdentities.has(identityKey))) continue;
    if (urlKey) seenUrls.add(urlKey);
    if (identityKey) seenIdentities.add(identityKey);
    deduped.push({ ...source, sourceId: `retrieval-${deduped.length + 1}` });
  }
  return deduped;
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
      Number.parseInt(strictDateMatch[1] || "0", 10),
      Number.parseInt(strictDateMatch[2] || "1", 10) - 1,
      Number.parseInt(strictDateMatch[3] || "1", 10),
      12,
    ));
    if (iso) return iso;
  }

  const yearMonthMatch = normalized.match(/^(\d{4})-(\d{2})$/);
  if (yearMonthMatch) {
    const iso = toIsoFromMs(Date.UTC(
      Number.parseInt(yearMonthMatch[1] || "0", 10),
      Number.parseInt(yearMonthMatch[2] || "1", 10) - 1,
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
    const amount = Number.parseInt(agoMatch[1] || "0", 10);
    const unit = agoMatch[2] || "";
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
  const relCanonicalMatch = html.match(/<link[^>]+rel=(?:"|')canonical(?:"|')[^>]*>/i);
  const relCanonical = relCanonicalMatch && relCanonicalMatch[0] ? relCanonicalMatch[0] : null;
  if (!relCanonical) return null;
  const hrefMatch = relCanonical.match(/href=(?:"|')([^"']+)(?:"|')/i);
  const href = hrefMatch && hrefMatch[1] ? hrefMatch[1] : null;
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
    const metaMatch = html.match(new RegExp(`<meta\\b[^>]*(?:property|name)=(?:"|')${escaped}(?:"|')[^>]*>`, "i"));
    const meta = metaMatch && metaMatch[0] ? metaMatch[0] : null;
    if (!meta) continue;
    const contentMatch = meta.match(/content=(?:"|')([^"']+)(?:"|')/i);
    const content = contentMatch && contentMatch[1] ? contentMatch[1] : null;
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
      if (publisher == null) publisher = readJsonLdText(record.publisher);
      if (author == null) author = readJsonLdText(record.author);
      if (publishedAt == null) publishedAt = toIsoDate(readJsonLdText(record.datePublished));
      if (updatedAt == null) updatedAt = toIsoDate(readJsonLdText(record.dateModified));
    }
  }

  return { publisher, author, publishedAt, updatedAt };
}

function extractArticleHtml(html: string): string | null {
  const articleMatch = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  const article = articleMatch && articleMatch[1] ? articleMatch[1] : null;
  if (article) return article;
  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const main = mainMatch && mainMatch[1] ? mainMatch[1] : null;
  if (main) return main;
  return null;
}

function coerceIsoFromMeta(value: string | null): string | null {
  const raw = readText(value);
  if (!raw) return null;
  const iso = toIsoDate(raw);
  return iso || normalizePublishedAt(raw);
}

function extractAttributedQuotes(
  text: string,
  options?: { defaultConfidence?: HearthAttributedQuote["confidence"] },
): HearthAttributedQuote[] | null {
  const quotes: HearthAttributedQuote[] = [];
  const defaultConfidence = options && options.defaultConfidence ? options.defaultConfidence : "direct";
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
        speaker = readText(attributionMatch[1]);
        organization = readText(attributionMatch[2]);
      }

      const hasAttribution = Boolean(speaker || organization);

      quotes.push({
        text: quoteText,
        speaker,
        organization,
        context: readText(contextWindow),
        confidence: hasAttribution ? defaultConfidence : "uncertain",
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
      const id = parsed.pathname.replace(/^\/+/, "").split("/")[0] || "";
      return id ? id : null;
    }
    if (host.endsWith("youtube.com")) {
      const id = parsed.searchParams.get("v") || "";
      return id ? id : null;
    }
  } catch {
    // ignore
  }
  return null;
}

function buildBrowserLikeHeaders(): Headers {
  const headers = new Headers();
  headers.set("accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
  headers.set("accept-language", "en-US,en;q=0.9");
  headers.set(
    "user-agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  );
  return headers;
}

function extractYouTubeDescriptionFromHtml(html: string): string | null {
  const og = extractMetaContent(html, ["og:description", "description"]);
  if (og) return og;

  const match = html.match(/"shortDescription":"((?:\\\\.|[^"\\])*)"/);
  if (!match || !match[1]) return null;
  try {
    const decoded = JSON.parse(`"${match[1]}"`) as unknown;
    return typeof decoded === "string" ? readText(decoded) : null;
  } catch {
    return null;
  }
}

function parseVttTimestampToMs(value: string): number | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})$/);
  if (!match) return null;
  const hours = Number.parseInt(match[1] || "0", 10);
  const minutes = Number.parseInt(match[2] || "0", 10);
  const seconds = Number.parseInt(match[3] || "0", 10);
  const millis = Number.parseInt(match[4] || "0", 10);
  if (![hours, minutes, seconds, millis].every((n) => Number.isFinite(n) && n >= 0)) return null;
  return (((hours * 60 + minutes) * 60) + seconds) * 1000 + millis;
}

function parseVttSegments(vtt: string): HearthTranscriptSegment[] {
  const lines = vtt.split(/\r?\n/);
  const segments: HearthTranscriptSegment[] = [];

  let cueIndex = 0;
  let i = 0;
  while (i < lines.length) {
    const line = String(lines[i] || "").trim();
    i += 1;
    if (!line) continue;
    if (/^WEBVTT\b/i.test(line)) continue;
    if (/^\d+$/.test(line)) continue;

    const timingMatch = line.match(/^(.+?)\s+-->\s+(.+?)(?:\s+.*)?$/);
    if (!timingMatch) continue;

    const startMs = parseVttTimestampToMs(timingMatch[1] || "");
    const endMs = parseVttTimestampToMs(timingMatch[2] || "");
    if (startMs == null) continue;

    const textLines: string[] = [];
    while (i < lines.length) {
      const next = String(lines[i] || "").trim();
      i += 1;
      if (!next) break;
      textLines.push(next.replace(/<[^>]+>/g, "").trim());
    }

    const text = compactWhitespace(textLines.join(" "));
    if (!text) continue;
    segments.push({
      cueIndex,
      startMs,
      endMs: endMs == null ? null : endMs,
      text,
    });
    cueIndex += 1;
    if (segments.length >= 2_000) break;
  }

  return segments;
}

function buildTranscriptPreview(segments: HearthTranscriptSegment[], maxChars: number): string {
  const parts: string[] = [];
  let used = 0;
  for (const segment of segments) {
    const text = segment.text.trim();
    if (!text) continue;
    const nextLen = text.length + (parts.length ? 1 : 0);
    if (used + nextLen > maxChars) break;
    parts.push(text);
    used += nextLen;
  }
  return compactWhitespace(parts.join(" "));
}

type YouTubeCaptionTrack = {
  lang: string;
  name: string | null;
  kind: string | null;
  isAutoGenerated: boolean;
};

function parseYouTubeCaptionTracks(xml: string): YouTubeCaptionTrack[] {
  const tracks: YouTubeCaptionTrack[] = [];
  const re = /<track\b([^>]+?)\/?>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const attrs = match[1] || "";
    const langMatch = attrs.match(/\blang_code="([^"]+)"/i);
    const lang = langMatch && langMatch[1] ? langMatch[1] : "";
    if (!lang) continue;
    const nameMatch = attrs.match(/\bname="([^"]*)"/i);
    const name = nameMatch && typeof nameMatch[1] === "string" ? nameMatch[1] : null;
    const kindMatch = attrs.match(/\bkind="([^"]+)"/i);
    const kind = kindMatch && typeof kindMatch[1] === "string" ? kindMatch[1] : null;
    const isAutoGenerated = (kind || "").toLowerCase() === "asr";
    tracks.push({
      lang,
      name: name && name.trim() ? name.trim() : null,
      kind: kind && kind.trim() ? kind.trim() : null,
      isAutoGenerated,
    });
    if (tracks.length >= 40) break;
  }
  return tracks;
}

function pickYouTubeCaptionTrack(tracks: YouTubeCaptionTrack[]): YouTubeCaptionTrack | null {
  const enNonAsr = tracks.find((t) => t.lang === "en" && !t.isAutoGenerated);
  if (enNonAsr) return enNonAsr;
  const enAsr = tracks.find((t) => t.lang === "en" && t.isAutoGenerated);
  if (enAsr) return enAsr;
  const firstNonAsr = tracks.find((t) => !t.isAutoGenerated);
  if (firstNonAsr) return firstNonAsr;
  return tracks.length ? tracks[0] : null;
}

async function fetchYouTubeCaptionTrackList(args: {
  url: string;
  signal?: AbortSignal;
}): Promise<{ tracks: YouTubeCaptionTrack[] | null; error: string | null }> {
  const videoId = extractYouTubeVideoId(args.url);
  if (!videoId) return { tracks: [], error: null };
  const listUrl = new URL(YOUTUBE_TIMEDTEXT_URL);
  listUrl.searchParams.set("v", videoId);
  listUrl.searchParams.set("type", "list");

  try {
    const response = await fetch(listUrl.toString(), {
      redirect: "follow",
      signal: args.signal,
      headers: buildBrowserLikeHeaders(),
    });
    if (!response.ok) return { tracks: null, error: `Track list returned ${response.status}` };
    const raw = await response.text();
    const parsed = parseYouTubeCaptionTracks(raw);
    return { tracks: parsed, error: null };
  } catch (error) {
    return { tracks: null, error: error instanceof Error ? error.message : "Unknown track list error" };
  }
}

async function fetchYouTubeTranscriptVtt(args: {
  url: string;
  track: YouTubeCaptionTrack;
  signal?: AbortSignal;
}): Promise<{ vtt: string | null; error: string | null }> {
  const videoId = extractYouTubeVideoId(args.url);
  if (!videoId) return { vtt: null, error: "Missing video id" };
  const timedText = new URL(YOUTUBE_TIMEDTEXT_URL);
  timedText.searchParams.set("v", videoId);
  timedText.searchParams.set("lang", args.track.lang);
  timedText.searchParams.set("fmt", "vtt");
  if (args.track.isAutoGenerated) timedText.searchParams.set("kind", "asr");
  if (args.track.name) timedText.searchParams.set("name", args.track.name);

  try {
    const response = await fetch(timedText.toString(), {
      redirect: "follow",
      signal: args.signal,
      headers: buildBrowserLikeHeaders(),
    });
    if (!response.ok) return { vtt: null, error: `Transcript returned ${response.status}` };
    const raw = await response.text();
    const trimmed = raw.trim();
    if (!trimmed) return { vtt: null, error: "Transcript body was empty" };
    return { vtt: trimmed, error: null };
  } catch (error) {
    return { vtt: null, error: error instanceof Error ? error.message : "Unknown transcript error" };
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
    const response = await fetch(oembed.toString(), {
      redirect: "follow",
      signal: args.signal,
      headers: buildBrowserLikeHeaders(),
    });
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
  return compactWhitespace(decodeHtmlEntities(titleMatch[1] || ""));
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function classifyAccessFailure(error: string | null): HearthResearchAccessFailureReason | null {
  const value = String(error ?? "").toLowerCase();
  if (!value) return null;
  if (/abort|cancel/.test(value)) return "cancelled";
  if (/timeout/.test(value)) return "timeout";
  if (/401|authentication|sign.?in|login/.test(value)) return "authentication_required";
  if (/402|paywall|subscription/.test(value)) return "paywall";
  if (/403|access denied|forbidden|robots/.test(value)) return "access_denied";
  if (/unsupported|content.type/.test(value)) return "unsupported_content";
  if (/fetch returned|http/.test(value)) return "http_error";
  return "extraction_failed";
}

class BraveSearchError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Brave search returned ${status}`);
    this.name = "BraveSearchError";
    this.status = status;
  }
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
    throw new BraveSearchError(response.status);
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
      title: readText(item.title) ? stripHtmlToText(readText(item.title) as string) : null,
      url: urlValue,
      domain,
      snippet: readText(item.description) ? truncate(stripHtmlToText(readText(item.description) as string), MAX_SNIPPET_CHARS) : null,
      publishedAt: normalizePublishedAt(readText(item.page_age) || readText(item.age)),
    });
  }
  const deduped: BraveSearchResult[] = [];
  const seen = new Set<string>();
  for (const result of normalized) {
    const key = canonicalizeResearchUrl(result.url);
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

  const sourceType = inferSourceType(args.candidate.url);
  const warnings: string[] = [];
  const addWarning = (warning: string) => {
    const trimmed = warning.trim();
    if (!trimmed) return;
    if (!warnings.includes(trimmed)) warnings.push(trimmed);
  };

  const base: Omit<FetchOutcome, "extractionStatus" | "extractionError"> = {
    sourceType,
    ingestMode: null,
    title: args.candidate.title,
    publisher: null,
    author: null,
    resolvedUrl: args.candidate.url,
    canonicalUrl: null,
    publishedAt: normalizePublishedAt(args.candidate.publishedAt),
    updatedAt: null,
    warnings,
    transcriptAvailable: false,
    extractedText: null,
    transcript: null,
    transcriptSegments: null,
    transcriptMeta: null,
    attributedQuotes: null,
  };

  try {
    if (sourceType === "tweet") {
      const oembed = await fetchTweetOEmbed({ url: args.candidate.url, signal: timeoutController.signal });
      if (oembed?.extractedText) {
        return {
          ...base,
          title: oembed.author ? `Post by ${oembed.author}` : base.title,
          publisher: oembed.publisher,
          author: oembed.author,
          extractedText: oembed.extractedText,
          attributedQuotes: extractAttributedQuotes(oembed.extractedText, { defaultConfidence: "direct" }),
          extractionStatus: "extracted",
          extractionError: null,
        };
      }
      addWarning("X extraction was partial or blocked.");
    }

    const response = await fetch(args.candidate.url, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
      },
      redirect: "follow",
      signal: timeoutController.signal,
    });

    const resolvedUrl = readText(response.url) || args.candidate.url;
    const contentType = compactWhitespace(response.headers.get("content-type") || "").toLowerCase();

    if (!response.ok) {
      return {
        ...base,
        resolvedUrl,
        extractionStatus: "failed",
        extractionError: `Fetch returned ${response.status}`,
      };
    }

    const rawText = await response.text();
    if (!rawText.trim()) {
      return {
        ...base,
        resolvedUrl,
        extractionStatus: "failed",
        extractionError: "Response body was empty",
      };
    }

    if (contentType.includes("text/html") || /<!doctype html|<html/i.test(rawText)) {
      const canonicalUrl = extractCanonicalUrl(rawText, resolvedUrl) || extractCanonicalUrl(rawText, args.candidate.url);
      const jsonLd = extractJsonLdMeta(rawText);
      const metaPublisher = extractMetaContent(rawText, ["og:site_name", "publisher", "application-name"]);
      const metaAuthor = extractMetaContent(rawText, ["author", "article:author"]);
      const metaPublished = extractMetaContent(rawText, ["article:published_time", "published_time", "date", "dc.date", "datePublished", "pubdate"]);
      const metaUpdated = extractMetaContent(rawText, ["article:modified_time", "modified_time", "dateModified", "dc.modified"]);

      const publishedAt = jsonLd.publishedAt || coerceIsoFromMeta(metaPublished) || base.publishedAt;
      const updatedAt = jsonLd.updatedAt || coerceIsoFromMeta(metaUpdated);

      if (sourceType === "youtube_video") {
        const description = extractYouTubeDescriptionFromHtml(rawText);
        if (!description) addWarning("Description extraction unavailable.");

        const oembed = await fetchYouTubeOEmbed({ url: resolvedUrl, signal: timeoutController.signal });
        const channelName = (oembed && oembed.author) || jsonLd.author || metaAuthor || null;
        const title = (oembed && oembed.title) || extractHtmlTitle(rawText) || base.title;

        // Transcript best-effort (optional)
        let transcriptSegments: HearthTranscriptSegment[] | null = null;
        let transcriptMeta: HearthTranscriptMeta | null = null;
        let transcriptAvailable = false;
        let ingestMode: FetchOutcome["ingestMode"] = "metadata_only";

        const listResult = await fetchYouTubeCaptionTrackList({ url: resolvedUrl, signal: timeoutController.signal });
        if (listResult.error) {
          addWarning("Transcript retrieval failed.");
          transcriptMeta = { language: null, isAutoGenerated: null, source: "unknown" };
          ingestMode = "partial_failure";
        } else if ((listResult.tracks || []).length === 0) {
          addWarning("Transcript not available (no caption tracks found).");
          transcriptMeta = { language: null, isAutoGenerated: null, source: "none" };
          ingestMode = "metadata_only";
        } else {
          const track = pickYouTubeCaptionTrack(listResult.tracks || []);
          if (!track) {
            addWarning("Transcript not available (no caption tracks found).");
            transcriptMeta = { language: null, isAutoGenerated: null, source: "none" };
            ingestMode = "metadata_only";
          } else {
            if (track.isAutoGenerated) addWarning("Captions appear auto-generated.");
            const vttResult = await fetchYouTubeTranscriptVtt({ url: resolvedUrl, track, signal: timeoutController.signal });
            if (vttResult.error || !vttResult.vtt) {
              addWarning("Transcript retrieval failed.");
              transcriptMeta = { language: track.lang, isAutoGenerated: track.isAutoGenerated, source: "unknown" };
              ingestMode = "partial_failure";
            } else {
              const parsed = parseVttSegments(vttResult.vtt);
              if (parsed.length === 0) {
                addWarning("Transcript retrieval failed.");
                transcriptMeta = { language: track.lang, isAutoGenerated: track.isAutoGenerated, source: "unknown" };
                ingestMode = "partial_failure";
              } else {
                transcriptSegments = parsed;
                transcriptMeta = { language: track.lang, isAutoGenerated: track.isAutoGenerated, source: "youtube_timedtext" };
                transcriptAvailable = true;
                ingestMode = "metadata_plus_transcript";
              }
            }
          }
        }

        const transcriptPreview = transcriptSegments ? buildTranscriptPreview(transcriptSegments, 2_000) : null;
        const quoteConfidence = transcriptMeta?.isAutoGenerated ? "likely_direct" : "direct";

        return {
          ...base,
          ingestMode,
          title,
          publisher: "YouTube",
          author: channelName,
          resolvedUrl,
          canonicalUrl,
          publishedAt,
          updatedAt,
          extractedText: description ? truncate(description, 2_000) : null,
          transcriptAvailable,
          transcript: transcriptPreview,
          transcriptSegments,
          transcriptMeta,
          attributedQuotes: transcriptPreview
            ? extractAttributedQuotes(transcriptPreview, { defaultConfidence: quoteConfidence })
            : null,
          extractionStatus: "extracted",
          extractionError: null,
        };
      }

      const publisher = jsonLd.publisher || metaPublisher || null;
      const author = jsonLd.author || metaAuthor || null;
      const articleHtml = extractArticleHtml(rawText);
      const extracted = stripHtmlToText(articleHtml || rawText);
      const extractedText = extracted ? truncate(extracted, MAX_FETCH_CHARS) : null;

      if (!extractedText) {
        return {
          ...base,
          title: extractHtmlTitle(rawText) || base.title,
          publisher,
          author,
          resolvedUrl,
          canonicalUrl,
          publishedAt,
          updatedAt,
          extractionStatus: "partial",
          extractionError: "HTML fetched but readable text extraction was empty",
        };
      }

      return {
        ...base,
        title: extractHtmlTitle(rawText) || base.title,
        publisher,
        author,
        resolvedUrl,
        canonicalUrl,
        publishedAt,
        updatedAt,
        extractedText,
        attributedQuotes: extractAttributedQuotes(extractedText, { defaultConfidence: "direct" }),
        extractionStatus: "extracted",
        extractionError: null,
      };
    }

    if (contentType.includes("text/plain") || contentType.includes("application/json") || contentType === "") {
      const compact = compactWhitespace(rawText);
      if (!compact) {
        return {
          ...base,
          resolvedUrl,
          extractionStatus: "partial",
          extractionError: "Plain text body was empty after normalization",
        };
      }
      return {
        ...base,
        resolvedUrl,
        extractedText: truncate(compact, MAX_FETCH_CHARS),
        attributedQuotes: extractAttributedQuotes(compact, { defaultConfidence: "direct" }),
        extractionStatus: "extracted",
        extractionError: null,
      };
    }

    return {
      ...base,
      resolvedUrl,
      extractionStatus: "skipped",
      extractionError: `Unsupported content type: ${contentType || "unknown"}`,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        ...base,
        resolvedUrl: null,
        extractionStatus: "failed",
        extractionError: "Fetch timed out or was aborted",
      };
    }
    return {
      ...base,
      resolvedUrl: null,
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
  const bestUrl = outcome.canonicalUrl || outcome.resolvedUrl || candidate.url;
  const domain = parseDomain(bestUrl) || candidate.domain;

  return {
    sourceId: args.sourceId,
    sourceType: outcome.sourceType,
    ...(outcome.ingestMode ? { ingestMode: outcome.ingestMode } : {}),
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
    warnings: outcome.warnings.length ? outcome.warnings : null,
    transcriptAvailable: outcome.transcriptAvailable,
    snippet: candidate.snippet,
    extractedText: outcome.extractedText,
    transcript: outcome.transcript,
    transcriptSegments: outcome.transcriptSegments,
    transcriptMeta: outcome.transcriptMeta,
    attributedQuotes: outcome.attributedQuotes,
    extractionStatus: outcome.extractionStatus,
    extractionError: outcome.extractionError,
    provenance: {
      origin: "creator_url",
      briefFingerprint: args.brief.briefFingerprint,
      inspectedAt: retrievedAt,
      inspectionStatus: outcome.extractionStatus === "extracted"
        ? "inspected"
        : outcome.extractedText ? "metadata_only" : "inaccessible",
      accessFailureReason: classifyAccessFailure(outcome.extractionError),
      verifiedInCurrentRequest: outcome.extractionStatus === "extracted",
    },
  };
}

export function classifyResearchSourceAuthority(source: HearthResearchSource): HearthResearchSourceAuthority {
  const identity = `${source.domain ?? ""} ${source.publisher ?? ""} ${source.title ?? ""}`.toLowerCase();
  if (/\b(?:wikipedia|wikimedia|wikiquote|britannica|encyclop(?:a)?edia)\b/.test(identity)) return "general_reference";
  if (/\.gov\b|\b(city of|county of|state of|department of|agency|commission|authority|public records?)\b/.test(identity)) return "primary_government";
  if (/\.edu\b|\b(university|college|journal|doi|peer.review|research institute)\b/.test(identity)) return "scholarly_technical";
  if (/\b(official|corporation|company|foundation|association|board|operator|developer)\b/.test(identity)) return "primary_institutional";
  if (/\b(visit|tourism|lifestyle|promotion|sponsored|advertorial|generic facts)\b/.test(identity)) return "promotional_general";
  return "reputable_secondary";
}

async function inspectResearchCandidate(args: {
  candidate: BraveSearchResult;
  sourceId: string;
  brief: HearthResearchBrief;
  sourceOrigin: HearthResearchSourceProvenance["origin"];
  signal?: AbortSignal;
}): Promise<HearthResearchSource> {
  const retrievedAt = new Date().toISOString();
  const outcome = await fetchReadableSource({ candidate: args.candidate, signal: args.signal });
  const bestUrl = outcome.canonicalUrl || outcome.resolvedUrl || args.candidate.url;
  const domain = parseDomain(bestUrl) || args.candidate.domain;
  return {
    sourceId: args.sourceId,
    title: outcome.title || args.candidate.title,
    sourceType: outcome.sourceType,
    ...(outcome.ingestMode ? { ingestMode: outcome.ingestMode } : {}),
    publisher: outcome.publisher,
    author: outcome.author,
    url: bestUrl,
    originalUrl: args.candidate.url,
    resolvedUrl: outcome.resolvedUrl,
    canonicalUrl: outcome.canonicalUrl,
    domain,
    publishedAt: outcome.publishedAt || normalizePublishedAt(args.candidate.publishedAt),
    updatedAt: outcome.updatedAt,
    retrievedAt,
    warnings: outcome.warnings.length ? outcome.warnings : null,
    transcriptAvailable: outcome.transcriptAvailable,
    snippet: args.candidate.snippet ? truncate(args.candidate.snippet, MAX_SNIPPET_CHARS) : null,
    extractedText: outcome.extractedText,
    transcript: outcome.transcript,
    transcriptSegments: outcome.transcriptSegments,
    transcriptMeta: outcome.transcriptMeta,
    attributedQuotes: outcome.attributedQuotes,
    extractionStatus: outcome.extractionStatus,
    extractionError: outcome.extractionError,
    provenance: {
      origin: args.sourceOrigin,
      briefFingerprint: args.brief.briefFingerprint,
      inspectedAt: retrievedAt,
      inspectionStatus: outcome.extractionStatus === "extracted"
        ? "inspected"
        : outcome.extractedText ? "metadata_only" : "inaccessible",
      accessFailureReason: classifyAccessFailure(outcome.extractionError),
      verifiedInCurrentRequest: outcome.extractionStatus === "extracted",
    },
  };
}

function goalEvidenceText(sources: HearthResearchSource[]): string {
  return sources
    .filter((source) => source.provenance?.inspectionStatus === "inspected")
    .map((source) => evidenceText(source))
    .join(" ")
    .toLowerCase();
}

function researchSubjectTokens(brief: HearthResearchBrief): string[] {
  return Array.from(new Set(brief.episodeTitle.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []))
    .filter((token) => !/^(?:episode|project|orlando|florida|current|research|about|with|from|that|this)$/.test(token));
}

function isResearchGoalCovered(brief: HearthResearchBrief, goal: string, sources: HearthResearchSource[]): boolean {
  const normalizedGoal = compactWhitespace(goal).toLowerCase();
  const evidence = goalEvidenceText(sources);
  if (!evidence) return false;
  if (/^(?:find|research|investigate|verify|look into)\b/.test(normalizedGoal)
    && /\b(?:sources?|citations?|evidence|reports?|examples?)\b/.test(normalizedGoal)) {
    return sources.some((source) => source.provenance?.inspectionStatus === "inspected");
  }
  if (/\b(?:how much|spend|spending|budget|cost|funding|investment|contract award)\b/.test(normalizedGoal)) {
    const subjectTokens = researchSubjectTokens(brief);
    return sources.some((source) => {
      if (source.provenance?.inspectionStatus !== "inspected") return false;
      return evidenceText(source).split(/(?:[.!?;]\s+|\r?\n+)/).some((passage) => {
        const normalizedPassage = passage.toLowerCase();
        const hasAmount = /(?:[$€£]\s?\d|\b\d+(?:\.\d+)?\s*(?:million|billion|thousand)\b)/i.test(passage);
        const hasFinancialContext = /\b(?:budget|cost|spend|spending|funding|investment|contract|award)\b/i.test(passage);
        const subjectMatches = subjectTokens.filter((token) => normalizedPassage.includes(token)).length;
        return hasAmount && hasFinancialContext
          && (subjectTokens.length === 0 || subjectMatches >= Math.min(2, subjectTokens.length));
      });
    });
  }
  if (/\b(?:when|date|year|timeline|heyday|history)\b/.test(normalizedGoal)) {
    return /\b(?:18|19|20)\d{2}\b|\b(?:18|19|20)\d0s\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(evidence);
  }
  if (/\b(?:why|cause|caused|decline|reason|led to)\b/.test(normalizedGoal)) {
    return /\b(?:because|caused|contributed|competition|competing|declined due|led to|resulted from|reason)\b/i.test(evidence);
  }
  const tokens = Array.from(new Set(normalizedGoal.match(/[a-z0-9]{4,}/g) ?? []))
    .filter((token) => !/^(?:what|when|where|which|with|from|that|this|were|have|current|about)$/.test(token));
  if (!tokens.length) return false;
  const matches = tokens.filter((token) => evidence.includes(token)).length;
  return matches >= Math.min(2, tokens.length) && matches / tokens.length >= 0.4;
}

function buildGoalRefinementQuery(brief: HearthResearchBrief, goal: string): string {
  const suffix = /\b(?:how much|spend|spending|budget|cost|funding|investment|contract award)\b/i.test(goal)
    ? "official budget contract award council agenda procurement"
    : /\b(?:when|date|year|timeline|heyday|history)\b/i.test(goal)
      ? "archive primary records dates historical reporting"
      : /\b(?:why|cause|caused|decline|reason|led to)\b/i.test(goal)
        ? "cause analysis contemporaneous reporting primary sources"
        : "official records independent reporting";
  return compactWhitespace(`${brief.episodeTitle} ${goal} ${suffix}`);
}

function evidenceText(source: HearthResearchSource): string {
  return compactWhitespace([source.title, source.snippet, source.extractedText, source.transcript].filter(Boolean).join(" "));
}

function buildSerializableEvidence(args: {
  brief: HearthResearchBrief;
  sources: HearthResearchSource[];
}): HearthResearchEvidence[] {
  return args.sources.map((source, index) => {
    const inspected = source.extractionStatus === "extracted"
      && source.provenance?.inspectionStatus === "inspected"
      && source.provenance.verifiedInCurrentRequest;
    return {
      evidenceId: `evidence-${index + 1}`,
      briefFingerprint: args.brief.briefFingerprint,
      workpieceId: args.brief.workpieceId,
      sourceId: source.sourceId,
      excerpt: inspected ? truncate(evidenceText(source), 700) || null : null,
      authority: classifyResearchSourceAuthority(source),
      state: inspected ? "inspected" : "inaccessible",
      uncertainty: inspected ? null : source.extractionError || "Source content could not be inspected in this request.",
    };
  });
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
    const label = source.title || source.domain || source.url;
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
      const withBrief = (result: HearthResearchResult): HearthResearchResult => ({
        ...result,
        brief: args.brief,
        evidence: result.evidence ?? [],
        artifact: result.artifact ?? null,
      });
      if (args.signal?.aborted) {
        return withBrief(buildEmptyHearthResearchResult({
          mode: "knowledge_first",
          runtimeStatus: "error",
          providerStatus: "request_cancelled",
          summary: "Research runtime was cancelled before execution.",
        }));
      }

      if (!braveApiKey) {
        return withBrief({
          ...buildEmptyHearthResearchResult({
            mode: "knowledge_first",
            runtimeStatus: "partial",
            providerStatus: "not_configured",
            summary: "Research provider is not configured; no retrieval-backed findings were produced.",
          }),
          synthesis: {
            summary: "No retrieval provider key was configured, so this request could not produce inspected evidence.",
            keyPoints: [
              `Query accepted: ${args.request.query}`,
              "Set HEARTH_RESEARCH_API_KEY, BRAVE_SEARCH_API_KEY, or BRAVE_API_KEY to enable live source retrieval.",
            ],
            uncertainties: [
              "No live source retrieval was executed in this pass.",
            ],
            coverageNote: "Provider not configured; 0/0 sources extracted.",
          },
        });
      }

      const candidates: BraveSearchResult[] = [];
      let providerError: unknown = null;
      try {
        const queries = Array.from(new Set([args.request.query, ...args.brief.queries]
          .map((query) => compactWhitespace(query))
          .filter(Boolean)))
          .slice(0, 3);
        for (const query of queries) {
          if (args.signal?.aborted) break;
          const queryCandidates = await searchWithBrave({
            apiKey: braveApiKey,
            request: { ...args.request, query, maxSources: args.request.maxSources },
            signal: args.signal,
          });
          candidates.push(...queryCandidates);
          if (candidates.length >= args.request.maxSources * 2) break;
        }
      } catch (error) {
        providerError = error;
        if (isAbortError(error)) {
          return withBrief(buildEmptyHearthResearchResult({
            mode: "knowledge_first",
            runtimeStatus: "error",
            providerStatus: "request_cancelled",
            summary: "Research retrieval was cancelled.",
          }));
        }
      }

      if (providerError && candidates.length === 0) {
        const rateLimited = providerError instanceof BraveSearchError && providerError.status === 429;
        return withBrief({
          ...buildEmptyHearthResearchResult({
            mode: "knowledge_first",
            runtimeStatus: "error",
            providerStatus: rateLimited ? "provider_rate_limited" : "configured_but_provider_failing",
            summary: rateLimited
              ? "Search provider rate limited the retrieval request."
              : "Search provider failed before retrieval could complete.",
          }),
          synthesis: {
            summary: rateLimited
              ? "Search provider rate limiting prevented retrieval-backed synthesis."
              : "Search provider returned an error, so no retrieval-backed synthesis was possible.",
            keyPoints: [`Query attempted: ${args.request.query}`],
            uncertainties: [providerError instanceof Error ? providerError.message : "Unknown search provider error"],
            coverageNote: "Provider error; 0/0 sources extracted.",
          },
        });
      }

      if (!candidates.length) {
        return withBrief({
          ...buildEmptyHearthResearchResult({
            mode: "retrieval_first",
            runtimeStatus: "no_results",
            providerStatus: "configured_and_operational",
            summary: `No results found for "${args.request.query}".`,
          }),
          synthesis: {
            summary: `No strong retrieval results were found for "${args.request.query}".`,
            keyPoints: ["Try broadening keywords or reducing recency constraints."],
            uncertainties: ["Search provider returned no web candidates for this query."],
            coverageNote: "No candidate sources returned by the search provider.",
          },
        });
      }

      const sources: HearthResearchSource[] = [];
      const uniqueCandidates = Array.from(new Map(candidates.map((candidate) => [canonicalizeResearchUrl(candidate.url), candidate])).values())
        .slice(0, args.request.maxSources);
      for (let index = 0; index < uniqueCandidates.length; index += 1) {
        const candidate = uniqueCandidates[index];
        if (args.signal?.aborted) break;
        sources.push(await inspectResearchCandidate({
          candidate,
          sourceId: `retrieval-${index + 1}`,
          brief: args.brief,
          sourceOrigin: args.sourceOrigin ?? "search",
          signal: args.signal,
        }));
      }

      const prioritizedSources = [
        ...sources.filter((source) => source.extractionStatus === "extracted"),
        ...sources.filter((source) => source.extractionStatus !== "extracted"),
      ];
      let uniqueSources = dedupeHearthResearchSources(prioritizedSources).slice(0, args.request.maxSources);
      const unresolvedGoals = args.brief.goals.filter((goal) => !isResearchGoalCovered(args.brief, goal, uniqueSources));
      const attemptedQueries = new Set(
        [args.request.query, ...args.brief.queries].map((query) => compactWhitespace(query).toLowerCase()),
      );
      const refinementQueries = unresolvedGoals
        .map((goal) => buildGoalRefinementQuery(args.brief, goal))
        .filter((query) => {
          const key = query.toLowerCase();
          if (!key || attemptedQueries.has(key)) return false;
          attemptedQueries.add(key);
          return true;
        })
        .slice(0, 3);
      const refinementSources: HearthResearchSource[] = [];
      const knownUrls = new Set(uniqueSources.map((source) => canonicalizeResearchUrl(source.canonicalUrl || source.resolvedUrl || source.url)));

      for (let index = 0; index < refinementQueries.length; index += 1) {
        if (args.signal?.aborted) break;
        try {
          const refinementCandidates = await searchWithBrave({
            apiKey: braveApiKey,
            request: { ...args.request, query: refinementQueries[index], maxSources: Math.min(args.request.maxSources, 3) },
            signal: args.signal,
          });
          const candidate = refinementCandidates.find((item) => !knownUrls.has(canonicalizeResearchUrl(item.url)));
          if (!candidate) continue;
          knownUrls.add(canonicalizeResearchUrl(candidate.url));
          refinementSources.push(await inspectResearchCandidate({
            candidate,
            sourceId: `refinement-${index + 1}`,
            brief: args.brief,
            sourceOrigin: args.sourceOrigin ?? "search",
            signal: args.signal,
          }));
        } catch (error) {
          if (isAbortError(error)) break;
        }
      }

      if (refinementSources.length > 0) {
        uniqueSources = dedupeHearthResearchSources([
          ...refinementSources.filter((source) => source.extractionStatus === "extracted"),
          ...uniqueSources,
          ...refinementSources.filter((source) => source.extractionStatus !== "extracted"),
        ]).slice(0, args.request.maxSources);
      }
      const effectiveBrief: HearthResearchBrief = refinementQueries.length > 0
        ? { ...args.brief, queries: Array.from(new Set([...args.brief.queries, ...refinementQueries])) }
        : args.brief;
      const remainingGoals = effectiveBrief.goals.filter((goal) => !isResearchGoalCovered(effectiveBrief, goal, uniqueSources));
      const extractionSuccessCount = uniqueSources.filter((source) => source.extractionStatus === "extracted").length;
      const extractionFailureCount = uniqueSources.length - extractionSuccessCount;
      const outcome = deriveRetrievalOutcome({
        sourceCount: uniqueSources.length,
        extractionSuccessCount,
        extractionFailureCount,
      });

      const synthesis = buildSynthesis({
        request: args.request,
        sources: uniqueSources,
        extractionSuccessCount,
        extractionFailureCount,
      });
      if (refinementQueries.length > 0) {
        synthesis.coverageNote = `${synthesis.coverageNote} Bounded refinements attempted: ${refinementQueries.length}.`;
      }
      if (remainingGoals.length > 0) {
        synthesis.uncertainties.push(`Unresolved explicit goals after bounded refinement: ${remainingGoals.join("; ")}.`);
      }

      const result: HearthResearchResult = {
        mode: outcome.mode,
        runtimeStatus: outcome.runtimeStatus,
        providerStatus: "configured_and_operational",
        brief: effectiveBrief,
        evidence: buildSerializableEvidence({ brief: effectiveBrief, sources: uniqueSources }),
        artifact: null,
        sources: uniqueSources,
        synthesis,
      };
      return result;
    },
  };
}
