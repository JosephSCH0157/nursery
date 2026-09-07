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
  assert.match(source, /setToken\(composite\.metadataUpdatedAt\)/);
  assert.match(source, /Promise\.allSettled/);
  assert.match(source, /readCanonicalThumbnailWorkspaceV3/);
  assert.match(source, /readThumbnailCandidateAuthorityProjection/);
  assert.match(source, /setPkg\(canonicalAfterComposite\.episodePackage\)/);
  assert.match(source, /if \(candidateAuthorityAfterComposite\) setCandidateAuthority\(candidateAuthorityAfterComposite\)/);
});

test("candidate cards render canonical composites and expose logo provenance", () => {
  assert.match(source, /<CanonicalThumbnailPreview/);
  assert.match(source, /Brand logo applied/);
  assert.match(source, /No thumbnail logo configured/);
});

test("My Brand generation requires the renderer-verified canonical logo receipt", () => {
  assert.match(source, /styleSource === "brand_profile" && !myBrandReady/);
  assert.match(source, /brandSetupReceipt\?\.schema_version === "forge\.thumbnail-brand-setup-receipt\.v1"/);
  assert.match(source, /did not verify the episode's canonical brand style/);
  assert.doesNotMatch(source, /did not verify a brand logo overlay/);
});

test("Automatic reload displays canonical brand-profile renders without relying on the transient setup receipt", () => {
  assert.match(source, /styleSource === "auto" && brandPresentation\.ready/);
  assert.doesNotMatch(source, /pendingStyleSource = styleSource === "brand_profile" \|\| \(styleSource === "auto" && myBrandReady\)/);
});

test("candidate edit and variation actions reveal their existing workspaces", () => {
  assert.match(source, /hearth-thumbnail-editor/);
  assert.match(source, /hearth-thumbnail-advanced/);
  assert.match(source, /hearth-thumbnail-variations/);
  assert.match(source, /scrollIntoView/);
});

test("thumbnail editor previews and canonically saves text and logo placement as one immutable render", () => {
  assert.match(source, /<label>Move text<select value=\{verticalPlacement\}/);
  assert.match(source, /top: verticalPlacement === "top"/);
  assert.match(source, /transform: verticalPlacement === "center"/);
  assert.match(source, /<label>Move logo<select value=\{logoPlacement\}/);
  assert.match(source, /logo_placement: logoPlacement/);
  const save = source.match(/const saveEditedThumbnail = async \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? "";
  assert.match(save, /saveRenderRecipe/);
  assert.match(save, /commitThumbnailLaunchComposite/);
  assert.match(save, /launchVariantId: sourceLaunch\.launch_variant_id/);
  assert.match(save, /recipeId: recipe\.id, recipeRevision: recipe\.revision/);
  assert.match(save, /if \(!result\.ok\)[\s\S]*setSaveState\("error"\)/);
  assert.match(save, /catch \(error\)[\s\S]*failed before Tongs returned a canonical result/);
  assert.match(save, /result\.launchReceipt/);
  assert.match(save, /receipt\.launchRevision !== sourceLaunch\.revision \+ 1/);
  assert.doesNotMatch(save, /setPkg\(next\)/);
  assert.match(source, />Cancel<\/button>/);
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
