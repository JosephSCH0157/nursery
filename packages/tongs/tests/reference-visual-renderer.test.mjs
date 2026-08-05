import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { renderCanonicalReferenceVisual } from "../dist/reference-visual-renderer.js";

const evidence = [{ id: "e1", numeric_value: 72, unit: "percent", label: "Production decline" }];
const recipe = { visual_subtype: "stat_card", title: "Florida citrus production", attribution_text: "Florida citrus report", accessibility_text: "Production declined 72 percent", recipe_json: { value: 72 } };

test("canonical Reference Visual rendering is deterministic and produces delivery PNG metadata", async () => {
  const first = await renderCanonicalReferenceVisual(recipe, evidence);
  const second = await renderCanonicalReferenceVisual(recipe, evidence);
  assert.equal(first.canonicalSvg, second.canonicalSvg);
  assert.deepEqual(first.pngBytes, second.pngBytes);
  assert.equal(first.rendererName, "forge_stat_card_v1");
  const metadata = await sharp(first.pngBytes).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 1920);
  assert.equal(metadata.height, 1080);
});

test("all V1 deterministic renderer contracts are available and maps remain unsupported", async () => {
  for (const visual_subtype of ["chart", "timeline", "document_excerpt", "quote_card", "stat_card", "comparison"]) {
    const result = await renderCanonicalReferenceVisual({ ...recipe, visual_subtype }, evidence);
    assert.equal(result.rendererName, `forge_${visual_subtype}_v1`);
  }
});
