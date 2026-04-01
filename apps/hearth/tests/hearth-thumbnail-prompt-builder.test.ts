import assert from "node:assert/strict";
import test from "node:test";
import { buildThumbnailPrompts } from "../src/lib/hearth-thumbnail-prompt-builder";

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

test("hearthThumbnailPromptBuilder: removes recognizable outlet brands from prompts", () => {
  const result = buildThumbnailPrompts({
    conceptBrief: "Show Fox News framing versus USA Today street footage with no logos visible.",
    title: "Same Protest, 5 Stories",
    tone: "cinematic_realism",
  });

  assert.equal(result.variants.length, 3);
  for (const variant of result.variants) {
    assert.doesNotMatch(variant.prompt, /fox news/i);
    assert.doesNotMatch(variant.prompt, /usa today/i);
    assert.doesNotMatch(variant.prompt, /^create\s+a\b/i);
  }
  assert.match(result.variants[0]?.prompt ?? "", /bold breaking-news style/i);
  assert.match(result.variants[0]?.prompt ?? "", /clean national broadcast style/i);
  assert.equal(result.variants[0]?.tagline, "Same footage, five different realities.");
});

test("hearthThumbnailPromptBuilder: preserves the framing intent from concept and title", () => {
  const result = buildThumbnailPrompts({
    conceptBrief: "Frame the thumbnail around a media-framing comparison between peaceful march coverage and escalation footage.",
    title: "Who Framed No Kings?",
    tone: "studio_photography",
  });

  assert.match(result.variants[0]?.prompt ?? "", /Who Framed No Kings\?/);
  assert.match(result.variants[1]?.prompt ?? "", /competing reads|editorial feel|comparison/i);
  assert.match(result.variants[2]?.prompt ?? "", /peaceful march coverage|escalation footage|tension|contrast/i);
});

test("hearthThumbnailPromptBuilder: produces three distinct prompt variants", () => {
  const result = buildThumbnailPrompts({
    conceptBrief: "Use one central subject, split interpretations, and strong emotion.",
    title: "The Media Split the Story",
  });

  assert.deepEqual(
    result.variants.map((variant) => variant.style),
    ["high_ctr", "balanced", "subtle"],
  );
  assert.equal(new Set(result.variants.map((variant) => variant.prompt)).size, 3);
  assert.match(result.variants[0]?.prompt ?? "", /faster emotional read|urgent/i);
  assert.match(result.variants[1]?.prompt ?? "", /grounded editorial feel|readable composition/i);
  assert.match(result.variants[2]?.prompt ?? "", /quieter read|restrained emotion/i);
  assert.equal(result.variants[1]?.tagline, undefined);
  assert.equal(result.variants[2]?.tagline, undefined);
});

test("hearthThumbnailPromptBuilder: handles weak input safely", () => {
  const result = buildThumbnailPrompts({
    conceptBrief: "   ",
    title: "",
  });

  assert.equal(result.variants.length, 3);
  for (const variant of result.variants) {
    assert.match(variant.prompt, /current-events scene|editorial/i);
    assert.doesNotMatch(variant.prompt, /undefined|null/i);
    assert.ok(countWords(variant.prompt) <= 120);
  }
});

test("hearthThumbnailPromptBuilder: keeps prompts compact and copy-ready", () => {
  const result = buildThumbnailPrompts({
    conceptBrief: "Open with a split between local news framing and a harder clash image after dark. Keep the visual simple and readable.",
    title: "Peaceful or Chaos?",
    tone: "cinematic_realism",
  });

  for (const variant of result.variants) {
    assert.ok(countWords(variant.prompt) >= 20);
    assert.ok(countWords(variant.prompt) <= 120);
    assert.doesNotMatch(variant.prompt, /lens-based composition|atmospheric detail/i);
  }
});
