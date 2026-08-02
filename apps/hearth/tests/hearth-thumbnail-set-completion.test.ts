import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const panel = readFileSync(resolve(process.cwd(), "src/components/visuals/ThumbnailV3Panel.tsx"), "utf8");
const thumbnailApi = readFileSync(resolve(process.cwd(), "src/lib/hearth-thumbnail-v3-api.ts"), "utf8");
const visualsSurface = readFileSync(resolve(process.cwd(), "src/views/surfaces/VisualsSurface.tsx"), "utf8");

test("Hearth finalizes the canonical set without a false Quench handoff", () => {
  assert.doesNotMatch(panel, /Send test set to Quench|Quench handoff|Sent to Quench|Handed off to Quench/);
  assert.match(panel, /Finish thumbnail set/);
  assert.match(panel, /Thumbnail set complete/);
  assert.match(panel, /Saved with this episode and available for release preparation/);
  const finalization = thumbnailApi.match(/export async function commitReadyLaunchesAsCandidateSet[\s\S]*?\n}/)?.[0] ?? "";
  assert.match(finalization, /commitThumbnailCandidateSet/);
  assert.match(finalization, /selectedLaunchVariantIds/);
  assert.match(panel, /Replace candidate set with these three thumbnails/);
  assert.match(panel, /use the brand style but do not include a logo/);
  assert.match(panel, /existing set will remain in canonical history/i);
  assert.doesNotMatch(finalization, /\/quench\//);
  assert.match(thumbnailApi, /thumbnail-candidates\/commit/);
});

test("canonical thumbnail completion advances to Images with persisted previews", () => {
  assert.match(visualsSurface, /Thumbnail set complete\. Images is ready\./);
  assert.match(visualsSurface, /CanonicalThumbnailPreview/);
  assert.doesNotMatch(visualsSurface, /Send test set to Quench|Quench handoff/);
});
