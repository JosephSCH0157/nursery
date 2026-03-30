import assert from "node:assert/strict";
import test from "node:test";
import { resolveHearthProductionArtifactFeedback } from "../src/lib/hearth-production-feedback";

test("hearthProductionFeedback: seo replies hydrate titles and descriptions", () => {
  const feedback = resolveHearthProductionArtifactFeedback({
    action: "seo",
    assistantText: [
      "SEO_TITLES:",
      "SAFE: Calm, Clear Title",
      "SPICY: Sharper Hook Title",
      "",
      "DESCRIPTION:",
      "A long-form description block for the episode.",
    ].join("\n"),
  });

  assert.equal(feedback.shouldRefreshEpisodePackage, true);
  assert.equal(feedback.titles.length, 2);
  assert.equal(feedback.titles[0]?.text, "Calm, Clear Title");
  assert.equal(feedback.descriptionLong, "A long-form description block for the episode.");
  assert.match(feedback.descriptionShort ?? "", /long-form description/i);
  assert.equal(feedback.warning, null);
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
});
