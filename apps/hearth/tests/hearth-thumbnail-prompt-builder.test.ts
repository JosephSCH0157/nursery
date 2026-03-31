import assert from "node:assert/strict";
import test from "node:test";
import { buildThumbnailPrompts } from "../src/lib/hearth-thumbnail-prompt-builder";

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
    assert.match(variant.prompt, /generic visual archetypes|recognizable brands/i);
  }
});

test("hearthThumbnailPromptBuilder: preserves the framing intent from concept and title", () => {
  const result = buildThumbnailPrompts({
    conceptBrief: "Frame the thumbnail around a media-framing comparison between peaceful march coverage and escalation footage.",
    title: "Who Framed No Kings?",
    tone: "studio_photography",
  });

  assert.match(result.variants[0]?.prompt ?? "", /Who Framed No Kings\?/);
  assert.match(result.variants[1]?.prompt ?? "", /media-framing comparison|competing interpretations|title angle/i);
  assert.match(result.variants[2]?.prompt ?? "", /peaceful march coverage|escalation footage|tension/i);
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
  assert.match(result.variants[0]?.prompt ?? "", /bold|emotionally immediate/i);
  assert.match(result.variants[1]?.prompt ?? "", /grounded|credible/i);
  assert.match(result.variants[2]?.prompt ?? "", /restrained|calm/i);
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
  }
});
