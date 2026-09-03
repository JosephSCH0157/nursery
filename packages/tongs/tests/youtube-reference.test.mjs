import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { inspectYouTubeReference, normalizeYouTubeUrl } from "../dist/youtube-reference.js";

const migration = await readFile(new URL("../../../supabase/migrations/20260811200000_tongs_youtube_reference_clip_authority.sql", import.meta.url), "utf8");
const service = await readFile(new URL("../src/workpiece-commit-api.ts", import.meta.url), "utf8");

test("YouTube URL variants normalize to one canonical external identity", () => {
  for (const url of [
    "https://youtu.be/dQw4w9WgXcQ?t=12",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=abc",
    "https://youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    "https://m.youtube.com/live/dQw4w9WgXcQ",
  ]) {
    assert.deepEqual(normalizeYouTubeUrl(url), {
      videoId: "dQw4w9WgXcQ",
      canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    });
  }
  assert.throws(() => normalizeYouTubeUrl("https://example.com/watch?v=dQw4w9WgXcQ"));
  assert.throws(() => normalizeYouTubeUrl("https://youtube.com/watch?v=too-short"));
});

test("YouTube metadata must describe the same normalized video", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
    title: "County hearing",
    author_name: "Orange County",
    author_url: "https://www.youtube.com/@OrangeCounty",
    thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    provider_name: "YouTube",
  }), { status: 200, headers: { "content-type": "application/json" } }));
  const result = await inspectYouTubeReference("https://youtu.be/dQw4w9WgXcQ");
  assert.equal(result.videoId, "dQw4w9WgXcQ");
  assert.equal(result.title, "County hearing");
  assert.equal(result.authorName, "Orange County");
});

test("migration preserves local clips while adding constrained external YouTube clips", () => {
  assert.match(migration, /delivery_kind in\('local_asset','youtube_external_reference'\)/);
  assert.match(migration, /delivery_kind='local_asset'.*asset_id is not null/s);
  assert.match(migration, /delivery_kind='youtube_external_reference'.*asset_id is null.*external_provider='youtube'/s);
  assert.match(migration, /commit_youtube_reference_clip_candidate/);
  assert.match(migration, /operation_type in\('plan_commit','source_fulfillment','candidate_commit','selection','youtube_reference_commit'\)/);
  assert.match(migration, /linked_source_revision_required/);
  assert.match(migration, /source_revision_id',c\.source_revision_id/);
  assert.match(migration, /source_link_revision_id',c\.workpiece_source_link_revision_id/);
  assert.match(migration, /forge\.reference-clips\.hammer\.v3/);
  assert.match(migration, /when 'fair_use_claimed' then 'fair_use_claim'/);
});

test("commit API verifies metadata and projects external references without downloading media", () => {
  assert.match(service, /inspectYouTubeReference\(input\.youtube_url\)/);
  assert.match(service, /commit_youtube_reference_clip_candidate/);
  assert.match(service, /status:\s*"external_reference"/);
  assert.match(service, /external_reference:\s*\{\s*provider/);
  assert.doesNotMatch(service, /fetchExternalBrollMedia\(input\.youtube_url/);
});
