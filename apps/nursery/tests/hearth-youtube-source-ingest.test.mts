import assert from "node:assert/strict";
import test from "node:test";
import { extractUrlToResearchSource } from "../server/hearth/hearth-research-runtime";

const WATCH_URL = "https://www.youtube.com/watch?v=qMHpj85KnYY";

function withMockFetch(run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  return run().finally(() => {
    globalThis.fetch = originalFetch;
  });
}

test("YouTube ingest: track exists but transcript fetch fails -> partial_failure with warnings", async () => {
  await withMockFetch(async () => {
    globalThis.fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url === WATCH_URL) {
        return new Response(
          [
            "<html><head>",
            `<link rel="canonical" href="${WATCH_URL}" />`,
            "<title>Virgin Media News</title>",
            "</head><body>shell</body></html>",
          ].join(""),
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }

      if (url.startsWith("https://www.youtube.com/oembed")) {
        return new Response(
          JSON.stringify({
            title: "Fuel Protests Bring Roads Nationwide To A Standstill As Government Pushes Back",
            author_name: "Virgin Media News",
            provider_name: "YouTube",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url.startsWith("https://www.youtube.com/api/timedtext") && url.includes("type=list")) {
        return new Response(
          '<transcript_list><track lang_code="en" name="" /></transcript_list>',
          { status: 200, headers: { "content-type": "text/xml" } },
        );
      }

      if (url.startsWith("https://www.youtube.com/api/timedtext") && url.includes("fmt=vtt")) {
        return new Response("nope", { status: 500 });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    };

    const source = await extractUrlToResearchSource({ url: WATCH_URL, sourceId: "link-1" });
    assert.equal(source.sourceType, "youtube_video");
    assert.equal(source.publisher, "YouTube");
    assert.equal(source.author, "Virgin Media News");
    assert.equal(source.ingestMode, "partial_failure");
    assert.equal(source.transcriptAvailable, false);
    assert.equal(source.transcriptSegments ?? null, null);
    assert.equal(source.transcriptMeta?.source, "unknown");
    assert.ok(Array.isArray(source.warnings));
    assert.ok(source.warnings?.includes("Transcript retrieval failed."));
    assert.ok(source.warnings?.includes("Description extraction unavailable."));
  });
});

test("YouTube ingest: no caption tracks -> metadata_only with standardized warning", async () => {
  await withMockFetch(async () => {
    globalThis.fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url === WATCH_URL) {
        return new Response(
          `<html><head><link rel="canonical" href="${WATCH_URL}" /></head><body>shell</body></html>`,
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }

      if (url.startsWith("https://www.youtube.com/oembed")) {
        return new Response(
          JSON.stringify({
            title: "Virgin Media News upload",
            author_name: "Virgin Media News",
            provider_name: "YouTube",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url.startsWith("https://www.youtube.com/api/timedtext") && url.includes("type=list")) {
        return new Response("<transcript_list></transcript_list>", {
          status: 200,
          headers: { "content-type": "text/xml" },
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    };

    const source = await extractUrlToResearchSource({ url: WATCH_URL, sourceId: "link-1" });
    assert.equal(source.sourceType, "youtube_video");
    assert.equal(source.ingestMode, "metadata_only");
    assert.equal(source.transcriptAvailable, false);
    assert.equal(source.transcriptMeta?.source, "none");
    assert.ok(source.warnings?.includes("Transcript not available (no caption tracks found)."));
    assert.ok(source.warnings?.includes("Description extraction unavailable."));
  });
});

test("YouTube ingest: ASR captions -> metadata_plus_transcript, auto-caption warning, likely_direct quote confidence", async () => {
  await withMockFetch(async () => {
    globalThis.fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url === WATCH_URL) {
        return new Response(
          `<html><head><link rel="canonical" href="${WATCH_URL}" /></head><body>shell</body></html>`,
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }

      if (url.startsWith("https://www.youtube.com/oembed")) {
        return new Response(
          JSON.stringify({
            title: "Virgin Media News upload",
            author_name: "Virgin Media News",
            provider_name: "YouTube",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url.startsWith("https://www.youtube.com/api/timedtext") && url.includes("type=list")) {
        return new Response(
          '<transcript_list><track lang_code="en" kind="asr" name="" /></transcript_list>',
          { status: 200, headers: { "content-type": "text/xml" } },
        );
      }

      if (url.startsWith("https://www.youtube.com/api/timedtext") && url.includes("fmt=vtt")) {
        return new Response(
          [
            "WEBVTT",
            "",
            "00:00:01.000 --> 00:00:03.000",
            "\"We’re here for the long haul,\" Leo Varadkar, Taoiseach said",
            "",
          ].join("\n"),
          { status: 200, headers: { "content-type": "text/vtt" } },
        );
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    };

    const source = await extractUrlToResearchSource({ url: WATCH_URL, sourceId: "link-1" });
    assert.equal(source.sourceType, "youtube_video");
    assert.equal(source.ingestMode, "metadata_plus_transcript");
    assert.equal(source.transcriptAvailable, true);
    assert.equal(source.transcriptMeta?.source, "youtube_timedtext");
    assert.equal(source.transcriptMeta?.isAutoGenerated, true);
    assert.ok(source.warnings?.includes("Captions appear auto-generated."));
    assert.ok(Array.isArray(source.transcriptSegments));
    assert.equal(source.transcriptSegments?.[0]?.cueIndex, 0);
    assert.ok(source.attributedQuotes?.[0]);
    assert.equal(source.attributedQuotes?.[0]?.confidence, "likely_direct");
  });
});

