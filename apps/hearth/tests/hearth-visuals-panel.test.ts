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

test("VisualsSurface recenters opened panels instead of pinning them to the top", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/views/surfaces/VisualsSurface.tsx"),
    "utf8",
  );

  assert.match(source, /block:\s*"center"/);
  assert.match(source, /setTimeout\(scrollPanelIntoView,\s*140\)/);
});
