import assert from "node:assert/strict";
import test from "node:test";
import { createReferenceClipPlan } from "../src/lib/hearth-reference-clip-plan";
import {
  buildReferenceClipPromptPack,
  buildTimelineImagePromptPack,
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
  assert.match(first?.pack.prompt ?? "", /render it as a photoreal|documentary still|cinematic/i);
  assert.match(first?.pack.prompt ?? "", /split composition|side-to-side comparison|editorial reads/i);
  assert.match(first?.pack.negative ?? "", /fake broadcast logos|text artifacts|plastic skin/i);
  assert.match(first?.pack.notes ?? "", /production-ready cinematic thumbnail prompt/i);
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
  assert.equal(first?.pack.styleTags, undefined);
  assert.match(first?.pack.prompt ?? "", /^Create a .*podcast thumbnail concept\./i);
  assert.match(first?.pack.prompt ?? "", /Show |Make the main subject|Keep it realistic/i);
  assert.match(first?.pack.notes ?? "", /Natural-language instruction pack tuned for direct paste/i);
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
    assert.equal(variant.pack.negative, undefined);
    assert.equal(variant.pack.styleTags, undefined);
    assert.match(variant.pack.prompt, /editorial|focal subject|readable/i);
    assert.match(variant.pack.notes ?? "", /generic \(fallback\)/i);
  }
});

test("visual providers: OpenArt and GPT Images intentionally shape the same beat differently", () => {
  const openart = buildThumbnailPromptPackVariants({
    conceptBrief: "Compare dismissive pundit framing against polished national coverage of the same protest.",
    title: "Same Footage, Different Story",
    tone: "cinematic_realism",
    aspectRatio: "16:9",
    providerId: "openart",
  }).variants[0]?.pack;

  const gpt = buildThumbnailPromptPackVariants({
    conceptBrief: "Compare dismissive pundit framing against polished national coverage of the same protest.",
    title: "Same Footage, Different Story",
    tone: "cinematic_realism",
    aspectRatio: "16:9",
    providerId: "gpt_images",
  }).variants[0]?.pack;

  assert.ok(openart);
  assert.ok(gpt);
  assert.notEqual(openart?.prompt, gpt?.prompt);
  assert.ok((openart?.styleTags?.length ?? 0) > 0);
  assert.equal(gpt?.styleTags, undefined);
  assert.ok((openart?.negative ?? "").length > 0);
  assert.equal(gpt?.negative, undefined);
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
  assert.match(result.pack.prompt, /32 percent|year-over-year|editorial|data point/i);
  assert.match(result.pack.prompt, /reference-image prompt|editorial reference/i);
});

test("visual providers: timeline image prompt pack uses the same active provider resolution flow", () => {
  const result = buildTimelineImagePromptPack({
    entry: {
      id: "img-1",
      anchor: "s1:para2",
      script_anchor: null,
      beat_anchor: null,
      anchor_scope: "attached",
      purpose: "coverage",
      description: "A split-screen protest image showing a calm march on one side and tense police lines on the other.",
      visual_intent: "contrast between peaceful turnout and later escalation",
      prompt_basis: "media framing comparison",
      style_preset: "cinematic_realism",
      intent: "comparison",
      source_type: "generated",
      origin: "hearth",
      visual_priority: "primary",
      visual_type: "still_image",
      section_intent_note: "Keep it grounded and readable as a narrated beat.",
      beat_order: 2,
      paragraph_beat_order: 1,
      candidate_assets: [],
      selected_asset_id: null,
      status: "draft",
      placement_hint: "first contrast beat",
    },
    providerId: "gpt_images",
  });

  assert.equal(result.provider.id, "gpt_images");
  assert.equal(result.pack.provider, "gpt_images");
  assert.equal(result.pack.aspectRatio, "16:9");
  assert.equal(result.pack.negative, undefined);
  assert.match(result.pack.prompt, /episode visual|timeline beat|spoken narration|comparison/i);
  assert.doesNotMatch(result.pack.prompt, /thumbnail|title card|cover art|click-through|CTR/i);
});

test("visual providers: timeline image prompt pack dedupes repeated description text", () => {
  const repeated = "Even our license plate still carries an orange — a symbol of something that barely exists in the landscape anymore.";
  const result = buildTimelineImagePromptPack({
    entry: {
      id: "img-dup-1",
      anchor: "s1:para3",
      script_anchor: null,
      beat_anchor: null,
      anchor_scope: "attached",
      purpose: "coverage",
      description: repeated,
      visual_intent: "cutaway coverage",
      prompt_basis: repeated,
      style_preset: "cinematic_realism",
      intent: "comparison",
      source_type: "stock",
      origin: "hearth",
      visual_priority: "primary",
      visual_type: "still_image",
      section_intent_note: "",
      beat_order: 1,
      paragraph_beat_order: 1,
      candidate_assets: [],
      selected_asset_id: null,
      status: "draft",
      placement_hint: "first occurrence",
    },
    providerId: "generic",
  });

  const normalizedNeedle = repeated.toLowerCase();
  const occurrences = (result.pack.prompt.toLowerCase().match(new RegExp(normalizedNeedle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
  assert.equal(occurrences, 1);
});

test("visual providers: timeline image prompt pack removes duplicate sentence fragments", () => {
  const repeatedSentence = "So here's the question that hangs over all of this. The one everybody asks sooner or later.";
  const result = buildTimelineImagePromptPack({
    entry: {
      id: "img-dup-2",
      anchor: "s1:para4",
      script_anchor: null,
      beat_anchor: null,
      anchor_scope: "attached",
      purpose: "coverage",
      description: `${repeatedSentence} So here's.`,
      visual_intent: "coverage",
      prompt_basis: repeatedSentence,
      style_preset: "cinematic_realism",
      intent: "cutaway",
      source_type: "stock",
      origin: "hearth",
      visual_priority: "primary",
      visual_type: "still_image",
      section_intent_note: "",
      beat_order: 1,
      paragraph_beat_order: 1,
      candidate_assets: [],
      selected_asset_id: null,
      status: "draft",
      placement_hint: "first occurrence",
    },
    providerId: "generic",
  });

  const occurrences = (
    result.pack.prompt.toLowerCase().match(/so here's the question that hangs over all of this\./g) ?? []
  ).length;
  assert.equal(occurrences, 1);
  assert.ok(!/\bso here's\.$/i.test(result.pack.prompt));
  assert.ok(!/\.\./.test(result.pack.prompt));
});
