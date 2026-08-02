import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(
  resolve(process.cwd(), "src/components/visuals/ThumbnailV3Panel.tsx"),
  "utf8",
);
const thumbnailApi = readFileSync(resolve(process.cwd(), "src/lib/hearth-thumbnail-v3-api.ts"), "utf8");
const visualsSurface = readFileSync(resolve(process.cwd(), "src/views/surfaces/VisualsSurface.tsx"), "utf8");

test("selected thumbnail generation remains visible after candidates exist", () => {
  const compareStage = source.match(
    /<section className="hs-thumbnail-stage" aria-labelledby="thumbnail-compare-heading">[\s\S]*?candidateCards\.length \?/,
  )?.[0] ?? "";

  assert.match(compareStage, /"Generate selected thumbnail"/);
  assert.match(compareStage, /onClick=\{\(\) => void generateSelectedThumbnail\(\)\}/);
});

test("generation prepares an unsaved selected direction before rendering", () => {
  const action = source.match(/const generateSelectedThumbnail = async \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? "";

  assert.match(action, /saveRecipe\(true\)/);
  assert.match(action, /renderBase\("forge_ai", undefined, prepared\)/);
});

test("Forge rendering publishes truthful shared AI activity", () => {
  assert.match(source, /writeHearthAiRuntimeStatus\(\{ isAiProcessing: true \}\)/);
  assert.match(source, /writeHearthAiRuntimeStatus\(\{ isAiProcessing: priorAiRuntime\.isAiProcessing \}\)/);
  assert.match(source, /Image generation can take a minute or more/);
});

test("generated base artwork is composed into a visible finished thumbnail", () => {
  assert.match(source, /const composite = await commitThumbnailLaunchComposite/);
  assert.match(source, /setPkg\(composite\.episodePackage\)/);
});

test("candidate cards render canonical composites and expose logo provenance", () => {
  assert.match(source, /<CanonicalThumbnailPreview/);
  assert.match(source, /Brand logo applied/);
  assert.match(source, /No thumbnail logo configured/);
});

test("My Brand generation requires verified style provenance without inventing a logo requirement", () => {
  assert.match(source, /styleSource === "brand_profile" && !brandPresentation\.ready/);
  assert.match(source, /did not verify the episode's canonical brand style/);
  assert.doesNotMatch(source, /did not verify a brand logo overlay/);
});

test("candidate edit and variation actions reveal their existing workspaces", () => {
  assert.match(source, /hearth-thumbnail-editor/);
  assert.match(source, /hearth-thumbnail-advanced/);
  assert.match(source, /hearth-thumbnail-variations/);
  assert.match(source, /scrollIntoView/);
});

test("an episode can explicitly adopt a newer revision of its existing workspace brand", () => {
  assert.match(source, /workspaceDefaultIsNewerVersion/);
  assert.match(source, /Update this episode to the latest/);
  assert.match(source, /Existing thumbnails will keep their original branding evidence/);
  assert.match(source, /expectedCurrentRevision/);
});

test("candidate replacement never implies that brand style includes a logo", () => {
  assert.match(source, /Replace candidate set with these three thumbnails/);
  assert.match(source, /use the brand style but do not include a logo/);
  assert.doesNotMatch(source, /three branded thumbnails/);
});

test("Hearth finalizes the canonical set without a false Quench handoff", () => {
  assert.doesNotMatch(source, /Send test set to Quench|Quench handoff|Sent to Quench|Handed off to Quench/);
  assert.match(source, /Finish thumbnail set/);
  assert.match(source, /Thumbnail set complete/);
  assert.match(source, /Saved with this episode and available for release preparation/);
  const finalization = thumbnailApi.match(/export async function commitReadyLaunchesAsCandidateSet[\s\S]*?\n}/)?.[0] ?? "";
  assert.match(finalization, /commitThumbnailCandidateSet/);
  assert.doesNotMatch(finalization, /\/quench\//);
  assert.match(thumbnailApi, /thumbnail-candidates\/commit/);
});

test("canonical thumbnail completion advances and announces Images", () => {
  assert.match(visualsSurface, /Thumbnail set complete\. Images is ready\./);
  assert.match(visualsSurface, /CanonicalThumbnailPreview/);
  assert.doesNotMatch(visualsSurface, /Send test set to Quench/);
});
