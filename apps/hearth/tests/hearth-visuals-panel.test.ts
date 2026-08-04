import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  HEARTH_VISUALS_PANEL_SECTION_IDS,
  toggleHearthVisualsPanel,
} from "../src/lib/hearth-visuals-panel";

test("toggleHearthVisualsPanel collapses the currently open panel when toggled again", () => {
  assert.equal(toggleHearthVisualsPanel("media_map", "media_map"), null);
});

test("toggleHearthVisualsPanel opens the requested panel when switching tools", () => {
  assert.equal(toggleHearthVisualsPanel("media_map", "thumbnails"), "thumbnails");
  assert.equal(toggleHearthVisualsPanel(null, "reference_clips"), "reference_clips");
});

test("hearthVisualsPanel section ids stay aligned with the rendered panel ids", () => {
  assert.deepEqual(HEARTH_VISUALS_PANEL_SECTION_IDS, {
    media_map: "hearth-media-map-panel",
    thumbnails: "hearth-thumbnail-panel",
    timeline_images: "hearth-image-map-panel",
    broll: "hearth-broll-plan-panel",
    reference_clips: "hearth-reference-clip-plan-panel",
  });
});

test("VisualsSurface focuses opened stages and retries layout-aware scrolling", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/views/surfaces/VisualsSurface.tsx"),
    "utf8",
  );

  assert.match(source, /focus\(\{preventScroll:true\}\)/);
  assert.match(source, /scrollIntoView\(\{behavior:reduced\?"auto":"smooth",block:"start"\}\)/);
  assert.match(source, /setTimeout\(focusStage,\s*800\)/);
});

test("explicit Images navigation remains sticky while workflow authority refreshes", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/views/surfaces/VisualsSurface.tsx"),
    "utf8",
  );

  assert.match(source, /const chooseStage=.*manualReviewRef\.current=true;setDisplayedStage\(id\)/);
  assert.match(source, /if\(advanced&&!manualReviewRef\.current\)moveToStage/);
  assert.doesNotMatch(source, /manualReviewRef\.current=id!==workflow\.activeStage/);
});

test("episode image direction is prominent and saved before generation", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/components/visuals/ImageMapPanel.tsx"),
    "utf8",
  );

  const directionIndex = source.indexOf('className="hs-episode-image-direction"');
  const generationIndex = source.indexOf('onClick={() => onGenerateCandidates("ai")}');
  assert.ok(directionIndex >= 0, "renders the image direction as a primary section");
  assert.ok(generationIndex > directionIndex, "places image direction before generation");
  assert.match(source, /saveState !== "saved"/, "generation waits for canonical direction save");
  assert.match(source, /Generate from the exact canonical final prompt revision shown above/);
  assert.match(source, /"Prompt copied" : "Copy canonical prompt"/, "copies the canonical creator-visible prompt");
  assert.match(source, /copyTextToClipboard\(canonicalPrompt\.finalPrompt\)/);
  assert.match(source, /event\.key !== "Enter" \|\| event\.shiftKey/);
  assert.match(source, /Press Enter to save this direction\. Use Shift\+Enter for a new line\./);
  assert.match(source, /directionDraftDirty \|\| saveState !== "saved"/);
});

test("interacting with an automatically opened stage disables workflow auto-follow", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/views/surfaces/VisualsSurface.tsx"),
    "utf8",
  );

  assert.match(source, /const preserveInteractedStage=\(\)=>\{manualReviewRef\.current=true;\}/);
  assert.match(source, /onPointerDownCapture=\{preserveInteractedStage\}/);
  assert.match(source, /onKeyDownCapture=\{preserveInteractedStage\}/);
});
