import assert from "node:assert/strict";
import test from "node:test";
import { resolveHammerImagePlacementListScrollTop } from "../src/editor/hammerImagePlacementListScroll";

test("Image Placement reveals an explicit selection only when it is outside the list viewport", () => {
  assert.equal(resolveHammerImagePlacementListScrollTop({ currentScrollTop: 200, viewportHeight: 300, itemTop: 100, itemHeight: 80 }), 100);
  assert.equal(resolveHammerImagePlacementListScrollTop({ currentScrollTop: 200, viewportHeight: 300, itemTop: 450, itemHeight: 100 }), 250);
  assert.equal(resolveHammerImagePlacementListScrollTop({ currentScrollTop: 200, viewportHeight: 300, itemTop: 250, itemHeight: 100 }), 200);
});

test("Image Placement list scroll math never targets a negative position", () => {
  assert.equal(resolveHammerImagePlacementListScrollTop({ currentScrollTop: 10, viewportHeight: 300, itemTop: -20, itemHeight: 10 }), 0);
});
