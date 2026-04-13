const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const source = readFileSync(
  resolve(process.cwd(), "src/components/visuals/BrollPlanPanel.tsx"),
  "utf8",
);

assert.match(source, /function isVideoCandidate\(/);
assert.match(
  source,
  /const previewPath = isVideoCandidate\(candidate\)\s*\n\s*\?\s*\(candidate\.preview_path \?\? candidate\.thumbnail_path \?\? ""\)\.trim\(\)\s*\n\s*:\s*\(candidate\.preview_path \?\? candidate\.path \?\? ""\)\.trim\(\);/s,
);
assert.match(source, /Generate Thumbnail/);

console.log("[ok] hearth-broll-thumb-guard");

