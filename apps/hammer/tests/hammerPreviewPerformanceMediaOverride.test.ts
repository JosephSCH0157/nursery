import assert from "node:assert/strict";
import { resolveHammerPreviewPerformanceMediaOverride } from "../src/editor/hammerPreviewPerformanceMediaOverride";

assert.equal(resolveHammerPreviewPerformanceMediaOverride({ development: false, search: "?hammer_preview_performance_media=/__hammer_performance__/a.mp4" }), null);
assert.equal(resolveHammerPreviewPerformanceMediaOverride({ development: true, search: "?hammer_preview_performance_media=/__hammer_performance__/a.mp4" }), "/__hammer_performance__/a.mp4");
assert.equal(resolveHammerPreviewPerformanceMediaOverride({ development: true, search: "?hammer_preview_performance_media=https://example.com/a.mp4" }), null);
assert.equal(resolveHammerPreviewPerformanceMediaOverride({ development: true, search: "?hammer_preview_performance_media=/__hammer_performance__/../secret.mp4" }), null);
console.log("Hammer Preview performance media override tests passed.");
