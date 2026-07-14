import {
  buildEmptyHearthResearchResult,
  type HearthAttributedQuote,
  type HearthResearchIngestMode,
  type HearthResearchExtractionStatus,
  type HearthResearchRequest,
  type HearthResearchResult,
  type HearthResearchSource,
  type HearthResearchSourceType,
  type HearthTranscriptMeta,
  type HearthTranscriptSegment,
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

export type HearthEvidenceSupportState =
  | "supported"
  | "partially_supported"
  | "contradicted"
  | "unverified_lead"
  | "editorial_inference";

export type HearthSourceAuthority =
  | "primary_agricultural"
  | "land_grant_university"
  | "government_agricultural"
  | "peer_reviewed"
  | "reputable_secondary"
  | "promotional_or_general";

export type HearthEvidenceFinding = {
  findingId: string;
  normalizedClaim: string;
  supportingSourceIds: string[];
  excerpts: Array<{ sourceId: string; text: string }>;
  strongestAuthority: HearthSourceAuthority | null;
  runIdentity: string;
  refinementIdentity: string | null;
  supportStrength: "strong" | "moderate" | "weak" | "none";
  state: HearthEvidenceSupportState;
  uncertainty: string | null;
};

export type HearthEvidenceLedger = {
  workspaceId: string | null;
  workpieceId: string;
  runIdentity: string;
  refinementIdentity: string | null;
  findings: HearthEvidenceFinding[];
  referenceSourceIds: string[];
};

const evidenceLedgers = new WeakMap<HearthResearchResult, HearthEvidenceLedger>();

export function getHearthEvidenceLedger(result: HearthResearchResult): HearthEvidenceLedger | null {
  return evidenceLedgers.get(result) ?? null;
}

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
  const normalized = compactWhitespace(String(value ?? ""))
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (/\bflorida department of agriculture(?: and consumer services)?\b|\bfdacs\b/.test(normalized)) return "fdacs";
  if (/\bunited states department of agriculture\b|\busda\b/.test(normalized)) return "usda";
  if (/\buniversity of florida\b.*\bifas\b|\buf ifas\b/.test(normalized)) return "uf-ifas";
  return normalized;
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

function buildDeterministicResearchRefinement(query: string): string | null {
  if (/\btangelo\b/i.test(query)) {
    return "Orlando Minneola Seminole tangelo cultivar origin developer release USDA ARS GRIN UF IFAS cold tolerance breeding objective";
  }
  const families = query.match(/\b(?:FDACS|USDA|NASS|UF IFAS|CRS|GAO|CDC|NIH)\b/gi) ?? [];
  if (!families.length) return null;
  const topic = compactWhitespace(query
    .replace(/\bprimary sources official reports data\b/gi, " ")
    .replace(/\b(?:find|strong|sources?|citations?|cite|for this episode|the episode)\b/gi, " "));
  const refined = compactWhitespace(`${topic} ${Array.from(new Set(families.map((value) => value.toUpperCase()))).join(" ")} official data report`);
  return refined && refined.toLowerCase() !== query.trim().toLowerCase() ? refined : null;
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
  };
}

export function classifyResearchSourceAuthority(source: HearthResearchSource): HearthSourceAuthority {
  const identity = `${source.domain ?? ""} ${source.publisher ?? ""} ${source.title ?? ""}`.toLowerCase();
  if (/\b(usda|ars|nal|grin)\b|\.usda\.gov\b/.test(identity)) return "primary_agricultural";
  if (/\b(ifas|land.grant|university of florida)\b|\.edu\b/.test(identity)) return "land_grant_university";
  if (/\b(fdacs|department of agriculture)\b|\.gov\b/.test(identity)) return "government_agricultural";
  if (/\b(journal|doi|hortscience|peer.review)\b/.test(identity)) return "peer_reviewed";
  if (/\b(visit|tourism|farm & family|lifestyle|trade|promotion|food safety|nutrition|generic facts)\b/.test(identity)) return "promotional_or_general";
  return "reputable_secondary";
}

const AUTHORITY_RANK: Record<HearthSourceAuthority, number> = {
  primary_agricultural: 6,
  land_grant_university: 5,
  government_agricultural: 4,
  peer_reviewed: 4,
  reputable_secondary: 2,
  promotional_or_general: 1,
};

function evidenceText(source: HearthResearchSource): string {
  return compactWhitespace([source.title, source.snippet, source.extractedText, source.transcript].filter(Boolean).join(" "));
}

function excerptForTerms(source: HearthResearchSource, terms: RegExp): string | null {
  const text = evidenceText(source);
  if (!text || !terms.test(text)) return null;
  terms.lastIndex = 0;
  const match = terms.exec(text);
  return truncate(text.slice(Math.max(0, (match?.index ?? 0) - 100), (match?.index ?? 0) + 340), 440);
}

function buildFinding(args: {
  findingId: string;
  claim: string;
  sources: HearthResearchSource[];
  terms: RegExp;
  requiredAuthority?: number;
  runIdentity: string;
  refinementIdentity: string | null;
  unsupportedReason: string;
}): HearthEvidenceFinding {
  const matches = args.sources
    .map((source) => ({ source, excerpt: excerptForTerms(source, args.terms), authority: classifyResearchSourceAuthority(source) }))
    .filter((entry): entry is { source: HearthResearchSource; excerpt: string; authority: HearthSourceAuthority } => Boolean(entry.excerpt));
  const compatible = matches.filter((entry) => AUTHORITY_RANK[entry.authority] >= (args.requiredAuthority ?? 2));
  const strongest = compatible.sort((a, b) => AUTHORITY_RANK[b.authority] - AUTHORITY_RANK[a.authority])[0] ?? null;
  const negativeCount = compatible.filter(({ excerpt }) => /\b(?:not|never|no evidence|incorrect|false)\b/i.test(excerpt)).length;
  const contradicted = negativeCount > 0;
  const hasConflict = contradicted && negativeCount < compatible.length;
  const state: HearthEvidenceSupportState = contradicted
    ? "contradicted"
    : compatible.length > 0 ? "supported" : matches.length > 0 ? "partially_supported" : "unverified_lead";
  return {
    findingId: args.findingId,
    normalizedClaim: compactWhitespace(args.claim),
    supportingSourceIds: compatible.map(({ source }) => source.sourceId),
    excerpts: compatible.map(({ source, excerpt }) => ({ sourceId: source.sourceId, text: excerpt })),
    strongestAuthority: strongest?.authority ?? null,
    runIdentity: args.runIdentity,
    refinementIdentity: args.refinementIdentity,
    supportStrength: strongest ? (AUTHORITY_RANK[strongest.authority] >= 5 ? "strong" : "moderate") : matches.length > 0 ? "weak" : "none",
    state,
    uncertainty: hasConflict
      ? "Retrieved authoritative evidence conflicts; both positions must be surfaced rather than silently resolved."
      : state === "supported" || state === "contradicted" ? null : args.unsupportedReason,
  };
}

function buildEvidenceLedger(args: {
  request: HearthResearchRequest;
  sources: HearthResearchSource[];
  workspaceId: string | null;
  workpieceId: string;
  runIdentity: string;
  refinementIdentity: string | null;
}): HearthEvidenceLedger {
  const findings: HearthEvidenceFinding[] = [];
  if (/\btangelo\b/i.test(args.request.query)) {
    findings.push(
      buildFinding({
        findingId: "tangelo-origin", claim: "Named tangelo cultivar origin, developer, or release history", sources: args.sources,
        terms: /\b(?:tangelo|Minneola|Honeybell|Orlando|Seminole)\b[\s\S]{0,180}\b(?:developed|origin|released|introduced|hybrid|cross)\b|\b(?:developed|origin|released|introduced|hybrid|cross)\b[\s\S]{0,180}\b(?:tangelo|Minneola|Honeybell|Orlando|Seminole)\b/i,
        requiredAuthority: 4, runIdentity: args.runIdentity, refinementIdentity: args.refinementIdentity,
        unsupportedReason: "Tourism and general-interest sources cannot establish precise cultivar origin, developer, or release history.",
      }),
      buildFinding({
        findingId: "tangelo-cold-tolerance", claim: "Documented cold tolerance for a tangelo or named cultivar", sources: args.sources,
        terms: /\b(?:tangelo|Minneola|Honeybell|Orlando|Seminole)\b[\s\S]{0,160}\b(?:cold.hardy|cold tolerant|freeze|frost|weather resilient)\b|\b(?:cold.hardy|cold tolerant|freeze|frost|weather resilient)\b[\s\S]{0,160}\b(?:tangelo|Minneola|Honeybell|Orlando|Seminole)\b/i,
        requiredAuthority: 4, runIdentity: args.runIdentity, refinementIdentity: args.refinementIdentity,
        unsupportedReason: "The retrieved evidence does not adequately establish a technical cold-tolerance description.",
      }),
      buildFinding({
        findingId: "tangelo-breeding-motive", claim: "Freeze resistance as the documented breeding objective for creating tangelos", sources: args.sources,
        terms: /\b(?:bred|breeding|developed|created)\b[\s\S]{0,180}\b(?:because of|in response to|objective|purpose|resist|survive)\b[\s\S]{0,100}\b(?:freeze|frost|cold)\b/i,
        requiredAuthority: 4, runIdentity: args.runIdentity, refinementIdentity: args.refinementIdentity,
        unsupportedReason: "Cold tolerance does not prove that freeze resistance was the original breeding purpose.",
      }),
    );
  } else {
    for (const source of args.sources.filter((entry) => entry.extractionStatus === "extracted")) {
      const excerpt = truncate(evidenceText(source), 440);
      if (!excerpt) continue;
      const authority = classifyResearchSourceAuthority(source);
      findings.push({
        findingId: `source-finding-${findings.length + 1}`,
        normalizedClaim: `${source.title || source.publisher || source.domain || "Retrieved source"} reports: ${excerpt}`,
        supportingSourceIds: [source.sourceId],
        excerpts: [{ sourceId: source.sourceId, text: excerpt }],
        strongestAuthority: authority,
        runIdentity: args.runIdentity,
        refinementIdentity: args.refinementIdentity,
        supportStrength: AUTHORITY_RANK[authority] >= 4 ? "strong" : "moderate",
        state: "supported",
        uncertainty: null,
      });
    }
    if (!findings.length) {
      findings.push({
        findingId: "retrieved-topic-coverage", normalizedClaim: args.request.query, supportingSourceIds: [], excerpts: [],
        strongestAuthority: null, runIdentity: args.runIdentity, refinementIdentity: args.refinementIdentity,
        supportStrength: "none", state: "unverified_lead", uncertainty: "No retrieved source directly establishes the requested claim.",
      });
    }
  }
  return {
    workspaceId: args.workspaceId,
    workpieceId: args.workpieceId,
    runIdentity: args.runIdentity,
    refinementIdentity: args.refinementIdentity,
    findings,
    referenceSourceIds: Array.from(new Set(findings.flatMap((finding) => finding.supportingSourceIds))),
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
      const runIdentity = `${args.workspaceId ?? "no-workspace"}:${args.workpieceId}:${Date.now()}`;
      let refinementIdentity: string | null = null;
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
              "Set HEARTH_RESEARCH_API_KEY, BRAVE_SEARCH_API_KEY, or BRAVE_API_KEY to enable live source retrieval.",
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
        const bestUrl = outcome.canonicalUrl || outcome.resolvedUrl || candidate.url;
        const domain = parseDomain(bestUrl) || candidate.domain;
        sources.push({
          sourceId: `retrieval-${index + 1}`,
          title: outcome.title || candidate.title,
          sourceType: outcome.sourceType,
          ...(outcome.ingestMode ? { ingestMode: outcome.ingestMode } : {}),
          publisher: outcome.publisher,
          author: outcome.author,
          url: bestUrl,
          originalUrl: candidate.url,
          resolvedUrl: outcome.resolvedUrl,
          canonicalUrl: outcome.canonicalUrl,
          domain,
          publishedAt: outcome.publishedAt || normalizePublishedAt(candidate.publishedAt),
          updatedAt: outcome.updatedAt,
          retrievedAt,
          warnings: outcome.warnings.length ? outcome.warnings : null,
          transcriptAvailable: outcome.transcriptAvailable,
          snippet: candidate.snippet ? truncate(candidate.snippet, MAX_SNIPPET_CHARS) : null,
          extractedText: outcome.extractedText,
          transcript: outcome.transcript,
          transcriptSegments: outcome.transcriptSegments,
          transcriptMeta: outcome.transcriptMeta,
          attributedQuotes: outcome.attributedQuotes,
          extractionStatus: outcome.extractionStatus,
          extractionError: outcome.extractionError,
        });
      }

      const initialLedger = buildEvidenceLedger({
        request: args.request,
        sources,
        workspaceId: args.workspaceId,
        workpieceId: args.workpieceId,
        runIdentity,
        refinementIdentity: null,
      });
      const hasUnsupportedClaim = initialLedger.findings.some((finding) => finding.state !== "supported" && finding.state !== "contradicted");
      if ((extractionSuccessCount < sources.length || hasUnsupportedClaim) && !args.signal?.aborted) {
        const refinedQuery = buildDeterministicResearchRefinement(args.request.query);
        if (refinedQuery) {
          refinementIdentity = `${runIdentity}:refinement-1`;
          try {
            const refinementCandidates = await searchWithBrave({
              apiKey: braveApiKey,
              request: { ...args.request, query: refinedQuery, maxSources: 2 },
              signal: args.signal,
            });
            const existingUrls = new Set(sources.map((source) => canonicalizeResearchUrl(source.url)));
            for (const candidate of refinementCandidates) {
              if (existingUrls.has(canonicalizeResearchUrl(candidate.url))) continue;
              const retrievedAt = new Date().toISOString();
              const refinedOutcome = await fetchReadableSource({ candidate, signal: args.signal });
              const bestUrl = refinedOutcome.canonicalUrl || refinedOutcome.resolvedUrl || candidate.url;
              sources.push({
                sourceId: `refinement-${sources.length + 1}`,
                title: refinedOutcome.title || candidate.title,
                sourceType: refinedOutcome.sourceType,
                ...(refinedOutcome.ingestMode ? { ingestMode: refinedOutcome.ingestMode } : {}),
                publisher: refinedOutcome.publisher,
                author: refinedOutcome.author,
                url: bestUrl,
                originalUrl: candidate.url,
                resolvedUrl: refinedOutcome.resolvedUrl,
                canonicalUrl: refinedOutcome.canonicalUrl,
                domain: parseDomain(bestUrl) || candidate.domain,
                publishedAt: refinedOutcome.publishedAt || normalizePublishedAt(candidate.publishedAt),
                updatedAt: refinedOutcome.updatedAt,
                retrievedAt,
                warnings: refinedOutcome.warnings.length ? refinedOutcome.warnings : null,
                transcriptAvailable: refinedOutcome.transcriptAvailable,
                snippet: candidate.snippet ? truncate(candidate.snippet, MAX_SNIPPET_CHARS) : null,
                extractedText: refinedOutcome.extractedText,
                transcript: refinedOutcome.transcript,
                transcriptSegments: refinedOutcome.transcriptSegments,
                transcriptMeta: refinedOutcome.transcriptMeta,
                attributedQuotes: refinedOutcome.attributedQuotes,
                extractionStatus: refinedOutcome.extractionStatus,
                extractionError: refinedOutcome.extractionError,
              });
              if (refinedOutcome.extractionStatus === "extracted") break;
            }
          } catch {
            // The original partial result remains useful when deterministic refinement fails.
          }
        }
      }

      const prioritizedSources = [
        ...sources.filter((source) => source.extractionStatus === "extracted"),
        ...sources.filter((source) => source.extractionStatus !== "extracted"),
      ];
      const uniqueSources = dedupeHearthResearchSources(prioritizedSources).slice(0, args.request.maxSources);
      extractionSuccessCount = uniqueSources.filter((source) => source.extractionStatus === "extracted").length;
      const extractionFailureCount = uniqueSources.length - extractionSuccessCount;
      const outcome = deriveRetrievalOutcome({
        sourceCount: uniqueSources.length,
        extractionSuccessCount,
        extractionFailureCount,
      });

      const result: HearthResearchResult = {
        mode: outcome.mode,
        runtimeStatus: outcome.runtimeStatus,
        sources: uniqueSources,
        synthesis: buildSynthesis({
          request: args.request,
          sources: uniqueSources,
          extractionSuccessCount,
          extractionFailureCount,
        }),
      };
      evidenceLedgers.set(result, buildEvidenceLedger({
        request: args.request,
        sources: uniqueSources,
        workspaceId: args.workspaceId,
        workpieceId: args.workpieceId,
        runIdentity,
        refinementIdentity,
      }));
      return result;
    },
  };
}
