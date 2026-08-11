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

test("facts-only stat cards preserve approximation and omit an empty public attribution", async () => {
  const result = await renderCanonicalReferenceVisual(
    { ...recipe, attribution_text: "", renderer_contract_version: "forge.reference-visual-renderer.v2" },
    [{ id: "e90", numeric_value: 90, unit: "percent", label: "Florida citrus production decline", raw_excerpt: "Production declined roughly 90% over two decades." }],
  );
  assert.match(result.canonicalSvg, />~90%<\/text>/);
  assert.doesNotMatch(result.canonicalSvg, /Source:/);
  assert.match(result.canonicalSvg, /Florida citrus production decline/);
  assert.equal(result.rendererName, "forge_stat_card_v2");
  assert.equal(result.rendererVersion, "2");
});

test("renderer V1 remains byte-stable and keeps its historical attribution behavior", async () => {
  const result = await renderCanonicalReferenceVisual({ ...recipe, attribution_text: "" }, evidence);
  assert.equal(result.rendererName, "forge_stat_card_v1");
  assert.equal(result.rendererVersion, "1");
  assert.match(result.canonicalSvg, /Source:/);
  assert.doesNotMatch(result.canonicalSvg, />~72%<\/text>/);
});

test("dense timelines remain chronological, associated, contained, and responsive without internal category labels", async () => {
  const denseEvidence = [
    { id: "event-2008", evidence_date: "2008-01-01", label: "Statewide monitoring expands after researchers confirm a sustained pattern across multiple growing regions.", category: "timeline" },
    { id: "event-1998", evidence_date: "1998-01-01", label: "A coordinated eradication program begins while growers adopt new inspection and reporting practices.", category: "timeline" },
    { id: "event-2017", evidence_date: "2017-01-01", label: "Long-term production data documents the cumulative effect on harvest volume and regional operations.", category: "timeline" },
    { id: "event-2005", evidence_date: "2005-01-01", label: "The first confirmed finding prompts an immediate response across commercial citrus operations statewide.", category: "timeline" },
    { id: "event-2023", evidence_date: "2023-01-01", label: "Updated field research supports a broader recovery strategy focused on resilient groves and improved practices.", category: "timeline" },
    { id: "event-2012", evidence_date: "2012-01-01", label: "Growers and scientists establish shared trials to evaluate treatments under real production conditions.", category: "timeline" },
  ];
  const result = await renderCanonicalReferenceVisual({ ...recipe, visual_subtype: "timeline", title: "A dense evidence timeline", subtitle: "Confirmed milestones remain connected to their dates." }, denseEvidence);
  const dates = [...result.canonicalSvg.matchAll(/data-evidence-date="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(dates, ["1998-01-01", "2005-01-01", "2008-01-01", "2012-01-01", "2017-01-01", "2023-01-01"]);
  for (const entry of denseEvidence) {
    assert.match(result.canonicalSvg, new RegExp(`data-evidence-id="${entry.id}"[^>]*data-evidence-date="${entry.evidence_date}"`));
    assert.match(result.canonicalSvg, new RegExp(entry.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").split(" ").slice(0, 4).join(" ")));
  }
  assert.equal((result.canonicalSvg.match(/data-timeline-event=/g) ?? []).length, denseEvidence.length);
  assert.match(result.canonicalSvg, /viewBox="0 0 1920 1080"/);
  assert.match(result.canonicalSvg, /data-timeline-side="left"/);
  assert.match(result.canonicalSvg, /data-timeline-side="right"/);
  assert.doesNotMatch(result.canonicalSvg, />timeline<\/text>/);
  const cards = [...result.canonicalSvg.matchAll(/<rect x="(150|1110)" y="([\d.]+)" width="660" height="([\d.]+)"/g)];
  assert.equal(cards.length, denseEvidence.length);
  for (const [, x, y, height] of cards) {
    assert.ok(Number(x) >= 70 && Number(x) + 660 <= 1850);
    assert.ok(Number(y) >= 350 && Number(y) + Number(height) <= 920.001);
  }
  const metadata = await sharp(result.pngBytes).metadata();
  assert.equal(metadata.width, 1920);
  assert.equal(metadata.height, 1080);
});
