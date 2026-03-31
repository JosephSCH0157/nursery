import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "src/components/visuals/EpisodeMediaMapPanel.tsx"),
  "utf8",
);

assert.match(source, /const FALLBACK_CONVERSATION:/);
assert.match(source, /const conversation = props\.conversation \?\? FALLBACK_CONVERSATION;/);
assert.doesNotMatch(source, /props\.conversation\.seed\?\./);
assert.doesNotMatch(source, /props\.conversation\.error/);

console.log("[ok] hearth-media-map-panel-smoke");
