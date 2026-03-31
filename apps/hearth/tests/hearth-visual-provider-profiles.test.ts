import assert from "node:assert/strict";
import test from "node:test";
import { createReferenceClipPlan } from "../src/lib/hearth-reference-clip-plan";
import {
  buildReferenceClipPromptPack,
  buildThumbnailPromptPackVariants,
  resolveActiveVisualProvider,
} from "../src/lib/hearth-visual-provider-profiles";

test("visual providers: workpiece override wins over global default", () => {
  const resolved = resolveActiveVisualProvider({
    override: "openart",
    defaultProvider: "gpt_images",
  });

  assert.equal(resolved.id, "openart");
  assert.equal(resolved.source, "workpiece_override");
  assert.equal(resolved.usedFallback, false);
});

test("visual providers: global default wins when no override is present", () => {
  const resolved = resolveActiveVisualProvider({
    defaultProvider: "gpt_images",
  });

  assert.equal(resolved.id, "gpt_images");
  assert.equal(resolved.source, "global_default");
  assert.equal(resolved.usedFallback, false);
});

test("visual providers: unknown provider falls back visibly to generic", () => {
  const resolved = resolveActiveVisualProvider({
    defaultProvider: "mystery-provider",
  });

  assert.equal(resolved.id, "generic");
  assert.equal(resolved.source, "generic_fallback");
  assert.equal(resolved.usedFallback, true);
  assert.match(resolved.bannerLabel, /generic \(fallback\)/i);
});

test("visual providers: OpenArt prompt packs include negative prompts and style tags", () => {
  const result = buildThumbnailPromptPackVariants({
    conceptBrief: "Show a split between bold breaking-news style coverage and clean national broadcast style coverage of the same march.",
    title: "Same Protest, 5 Stories",
    tone: "cinematic_realism",
    aspectRatio: "16:9",
    providerId: "openart",
  });

  assert.equal(result.variants.length, 3);
  const first = result.variants[0];
  assert.equal(first?.pack.provider, "openart");
  assert.equal(first?.pack.aspectRatio, "16:9");
  assert.ok((first?.pack.negative ?? "").length > 0);
  assert.ok((first?.pack.styleTags?.length ?? 0) > 0);
});

test("visual providers: GPT Images prompt packs stay natural-language without negative prompts", () => {
  const result = buildThumbnailPromptPackVariants({
    conceptBrief: "Keep one dominant subject and frame the protest as a media-framing comparison.",
    title: "Who Framed No Kings?",
    tone: "studio_photography",
    aspectRatio: "1:1",
    providerId: "gpt_images",
  });

  const first = result.variants[0];
  assert.equal(first?.pack.provider, "gpt_images");
  assert.equal(first?.pack.aspectRatio, "1:1");
  assert.equal(first?.pack.negative, undefined);
  assert.match(first?.pack.prompt ?? "", /editorial image showing|main subject/i);
});

test("visual providers: generic thumbnail fallback produces copy-safe prompt packs", () => {
  const result = buildThumbnailPromptPackVariants({
    conceptBrief: "   ",
    title: "",
    providerId: "unknown-provider",
  });

  assert.equal(result.provider.id, "generic");
  assert.equal(result.provider.usedFallback, true);
  assert.equal(result.variants.length, 3);
  for (const variant of result.variants) {
    assert.ok(variant.pack.prompt.length > 0);
    assert.match(variant.pack.notes ?? "", /generic \(fallback\)/i);
  }
});

test("visual providers: reference clip prompt pack reuses existing clip context", () => {
  const entry = createReferenceClipPlan({
    workpieceId: "wp-1",
    anchorText: "By 2024 the region dropped 32 percent in output.",
    description: "Map plus year-over-year line chart",
    format: "hybrid",
  });

  const result = buildReferenceClipPromptPack({
    entry,
    workpieceId: "wp-1",
    workpieceTitle: "Harbor Infrastructure Episode",
    providerId: "openart",
  });

  assert.equal(result.pack.provider, "openart");
  assert.equal(result.pack.aspectRatio, "16:9");
  assert.ok((result.pack.negative ?? "").length > 0);
  assert.match(result.pack.prompt, /32 percent|map plus year-over-year line chart|editorial/i);
});

