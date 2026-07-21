import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(
  resolve(process.cwd(), "src/components/visuals/ThumbnailV3Panel.tsx"),
  "utf8",
);

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
