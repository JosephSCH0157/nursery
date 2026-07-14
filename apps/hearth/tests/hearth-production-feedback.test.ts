import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveHearthProductionArtifactFeedback,
  validateHearthProductionArtifactOutput,
} from "../src/lib/hearth-production-feedback";
import { buildProductionPrompt } from "../src/lib/hearth-production-actions";

test("production prompts use the single approved-script copy in episode context", () => {
  const secretScriptLine = "THIS SCRIPT LINE MUST NOT BE DUPLICATED INTO CHAT HISTORY";
  const prompt = buildProductionPrompt({
    action: "seo",
    scriptVersion: 4,
    episodeTitle: "Test episode",
  });
  assert.doesNotMatch(prompt, new RegExp(secretScriptLine));
  assert.match(prompt, /approved script in episode_context/i);
  assert.match(prompt, /SCRIPT_VERSION: 4/);
});

test("hearthProductionFeedback: seo replies hydrate titles and descriptions", () => {
  const feedback = resolveHearthProductionArtifactFeedback({
    action: "seo",
    assistantText: [
      "SEO_TITLES:",
      "SAFE: Calm, Clear Title",
      "SPICY: Sharper Hook Title",
      "BALANCED_1: Grounded Middle Title",
      "",
      "DESCRIPTION:",
      "A long-form description block for the episode.",
    ].join("\n"),
  });

  assert.equal(feedback.shouldRefreshEpisodePackage, true);
  assert.equal(feedback.titles.length, 3);
  assert.equal(feedback.titles[0]?.text, "Calm, Clear Title");
  assert.equal(feedback.descriptionLong, "A long-form description block for the episode.");
  assert.match(feedback.descriptionShort ?? "", /long-form description/i);
  assert.equal(feedback.warning, null);
});

test("hearthProductionFeedback: markdown output parses and placeholders cannot count as generated titles", () => {
  const parsed = validateHearthProductionArtifactOutput({
    action: "seo",
    assistantText: [
      "## **SEO_TITLES:**",
      "1. **SAFE**: A Real First Title",
      "2. **SPICY** — A Real Second Title",
      "3. **BALANCED_1:** A Real Third Title",
      "",
      "**DESCRIPTION:**",
      "Episode description.",
    ].join("\n"),
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.feedback.titles.map((title) => title.text), [
    "A Real First Title",
    "A Real Second Title",
    "A Real Third Title",
  ]);

  const placeholders = validateHearthProductionArtifactOutput({
    action: "seo",
    assistantText: "SEO_TITLES:\nSAFE: Title A\nSPICY: Title B\nBALANCED_1: Title C",
  });
  assert.equal(placeholders.ok, false);
});

test("hearthProductionFeedback: structured title and tag arrays remain usable", () => {
  const titles = validateHearthProductionArtifactOutput({
    action: "seo",
    assistantText: JSON.stringify({ titles: ["First", "Second", "Third", "Fourth", "Fifth"] }),
  });
  assert.equal(titles.ok, true);
  if (titles.ok) assert.deepEqual(titles.feedback.titles.map((title) => title.text), ["First", "Second", "Third", "Fourth", "Fifth"]);

  const tags = validateHearthProductionArtifactOutput({
    action: "tags",
    assistantText: JSON.stringify({ result: { tags: ["Florida citrus", "orange history", "agriculture"] } }),
  });
  assert.equal(tags.ok, true);
  if (tags.ok) assert.deepEqual(tags.feedback.tags, ["florida-citrus", "orange-history", "agriculture"]);
});

test("hearthProductionFeedback: tags replies hydrate tags and warn on empty structured output", () => {
  const parsed = resolveHearthProductionArtifactFeedback({
    action: "tags",
    assistantText: [
      "TAGS_TOP10:",
      "media framing, protest coverage, no kings protest",
      "",
      "TAGS_FULL:",
      "media framing, protest coverage, no kings protest, cable news",
    ].join("\n"),
  });

  assert.equal(parsed.shouldRefreshEpisodePackage, true);
  assert.deepEqual(parsed.tags, [
    "media-framing",
    "protest-coverage",
    "no-kings-protest",
    "cable-news",
  ]);
  assert.equal(parsed.warning, null);

  const empty = resolveHearthProductionArtifactFeedback({
    action: "tags",
    assistantText: "Here are some good ideas, but not in the contract.",
  });

  assert.equal(empty.tags.length, 0);
  assert.match(empty.warning ?? "", /could not extract structured tags/i);

  const markdownTags = validateHearthProductionArtifactOutput({
    action: "tags",
    assistantText: "## **TAGS_TOP10:**\n- florida citrus, orange groves, citrus greening",
  });
  assert.equal(markdownTags.ok, true);
});

test("hearthProductionFeedback: thumbnail replies warn when no structured concept brief is present", () => {
  const parsed = resolveHearthProductionArtifactFeedback({
    action: "thumbnails",
    assistantText: [
      "THUMBNAIL_01",
      "Headline: Smoke and Signals",
      "Image concept: Split screen of protest crowd and studio anchor",
      "Mood/style: urgent editorial still",
    ].join("\n"),
  });

  assert.equal(parsed.shouldRefreshEpisodePackage, true);
  assert.equal(parsed.warning, null);

  const empty = resolveHearthProductionArtifactFeedback({
    action: "thumbnails",
    assistantText: "A few thumbnail ideas, but not in the expected block format.",
  });

  assert.match(empty.warning ?? "", /could not extract structured concept briefs/i);
});
