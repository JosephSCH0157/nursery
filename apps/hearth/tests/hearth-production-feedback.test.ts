import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveHearthProductionArtifactFeedback,
  validateHearthProductionArtifactOutput,
} from "../src/lib/hearth-production-feedback";
import { buildProductionPrompt, resolveAcceptedTagProposal } from "../src/lib/hearth-production-actions";
import { parseReleasePrepPackSections } from "../src/lib/hearth-release-prep-pack";

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

test("hearthProductionFeedback: seo replies hydrate titles only", () => {
  const feedback = resolveHearthProductionArtifactFeedback({
    action: "seo",
    assistantText: [
      "SEO_TITLES:",
      "SAFE: Calm, Clear Title",
      "SPICY: Sharper Hook Title",
      "BALANCED_1: Grounded Middle Title",
      "BALANCED_2: A Fourth Option",
      "BALANCED_3: The Fifth Hook",
    ].join("\n"),
  });

  assert.equal(feedback.shouldRefreshEpisodePackage, true);
  assert.equal(feedback.titles.length, 5);
  assert.equal(feedback.titles[0]?.text, "Calm, Clear Title");
  assert.equal(feedback.descriptionLong, null);
  assert.equal(feedback.descriptionShort, null);
  assert.equal(feedback.warning, null);
});

test("hearthProductionFeedback: paid titles reject markdown, partial output, and placeholders", () => {
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
  assert.equal(parsed.ok, false);

  const placeholders = validateHearthProductionArtifactOutput({
    action: "seo",
    assistantText: "SEO_TITLES:\nSAFE: Title A\nSPICY: Title B\nBALANCED_1: Title C",
  });
  assert.equal(placeholders.ok, false);
});

test("hearthProductionFeedback: structured title arrays cannot bypass the paid contract; tag arrays remain usable", () => {
  const titles = validateHearthProductionArtifactOutput({
    action: "seo",
    assistantText: JSON.stringify({
      titles: ["First", "Second", "Third", "Fourth", "Fifth"],
      short_description: "A concise episode summary.",
      long_description: "A detailed YouTube-ready episode description.",
    }),
  });
  assert.equal(titles.ok, false);

  const tags = validateHearthProductionArtifactOutput({
    action: "tags",
    assistantText: JSON.stringify({ result: { tags: ["Florida citrus", "orange history", "agriculture"] } }),
  });
  assert.equal(tags.ok, true);
  if (tags.ok) assert.deepEqual(tags.feedback.tags, ["florida-citrus", "orange-history", "agriculture"]);
});

test("hearthProductionFeedback: titles do not require descriptions", () => {
  const result = validateHearthProductionArtifactOutput({
    action: "seo",
    assistantText: "SEO_TITLES:\nSAFE: First\nSPICY: Second\nBALANCED_1: Third\nBALANCED_2: Fourth\nBALANCED_3: Fifth",
  });
  assert.equal(result.ok, true);
});

test("production prompts keep titles, tags, and framing pack contracts separate", () => {
  const titles = buildProductionPrompt({ action: "seo", scriptVersion: 1, episodeTitle: "Episode" });
  const tags = buildProductionPrompt({ action: "tags", scriptVersion: 1, episodeTitle: "Episode" });
  const pack = buildProductionPrompt({ action: "release_prep_pack", scriptVersion: 1, episodeTitle: "Episode" });
  assert.match(titles, /SEO_TITLES:/);
  assert.doesNotMatch(titles, /SHORT_DESCRIPTION|TAGS_FULL|MONETIZATION_ANGLE/);
  assert.match(tags, /TAGS_TOP10:/);
  assert.match(tags, /no more than 10 tags/i);
  assert.match(tags, /directly supported by the approved episode/i);
  assert.doesNotMatch(tags, /TAGS_FULL:/);
  assert.doesNotMatch(tags, /SEO_TITLES|SHORT_DESCRIPTION|MONETIZATION_ANGLE/);
  assert.match(pack, /MONETIZATION_ANGLE:/);
  assert.match(pack, /SHORT_DESCRIPTION:/);
  assert.match(pack, /LONG_DESCRIPTION:/);
  assert.doesNotMatch(pack, /TAGS_FULL|SEO_TITLES:/);
});

test("hearthProductionFeedback: framing pack requires and exposes both descriptions", () => {
  const assistantText = [
    "YOUTUBE_OPTIMIZED_CUT:",
    "- Open on the central tension.",
    "",
    "TITLE_OPTIONS:",
    "- Florida's Orange Reckoning",
    "",
    "SHORT_DESCRIPTION:",
    "How Florida oranges became an icon—and what threatens their future.",
    "",
    "LONG_DESCRIPTION:",
    "A detailed, script-grounded account of Florida citrus, its history, and its uncertain future.",
    "",
    "SHORT_FORM_HOOK_20S:",
    "- The orange in your kitchen carries a much bigger story.",
  ].join("\n");
  const result = validateHearthProductionArtifactOutput({ action: "release_prep_pack", assistantText });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.feedback.descriptionShort, "How Florida oranges became an icon—and what threatens their future.");
    assert.match(result.feedback.descriptionLong ?? "", /detailed, script-grounded account/i);
  }
  assert.deepEqual(
    parseReleasePrepPackSections(assistantText).map((section) => section.key),
    ["youtube_optimized_cut", "title_options", "short_description", "long_description", "short_form_hook_20s"],
  );

  const incomplete = validateHearthProductionArtifactOutput({
    action: "release_prep_pack",
    assistantText: "YOUTUBE_OPTIMIZED_CUT:\n- A useful edit plan without descriptions.",
  });
  assert.equal(incomplete.ok, false);
  if (!incomplete.ok) assert.match(incomplete.error, /both SHORT_DESCRIPTION and LONG_DESCRIPTION/i);
});

test("tag proposal acceptance only reintroduces visible proposed tags", () => {
  const canonical = ["kept-tag"];
  assert.deepEqual(resolveAcceptedTagProposal({ canonicalTags: canonical, proposedTags: ["new-tag"], mode: "merge" }), ["kept-tag", "new-tag"]);
  assert.deepEqual(resolveAcceptedTagProposal({ canonicalTags: canonical, proposedTags: ["deleted-tag"], mode: "merge" }), ["kept-tag", "deleted-tag"]);
  assert.deepEqual(resolveAcceptedTagProposal({ canonicalTags: canonical, proposedTags: ["replacement"], mode: "replace" }), ["replacement"]);
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
  assert.deepEqual(parsed.tags, ["media-framing", "protest-coverage", "no-kings-protest"]);
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

test("hearthProductionFeedback: generated tag proposals prefer the ranked top set and never exceed ten", () => {
  const verbose = resolveHearthProductionArtifactFeedback({
    action: "tags",
    assistantText: [
      "TAGS_TOP10:",
      "Union Pacific Big Boy 4014, Big Boy 4014, Union Pacific Railroad, steam locomotive restoration, articulated steam locomotive, heritage railroad, excursion train, steam locomotive, railroad history, Cheyenne Wyoming, extra ignored tag",
      "",
      "TAGS_FULL:",
      Array.from({ length: 47 }, (_, index) => `broad tag ${index + 1}`).join(", "),
    ].join("\n"),
  });

  assert.deepEqual(verbose.tags, [
    "union-pacific-big-boy-4014",
    "big-boy-4014",
    "union-pacific-railroad",
    "steam-locomotive-restoration",
    "articulated-steam-locomotive",
    "heritage-railroad",
    "excursion-train",
    "steam-locomotive",
    "railroad-history",
    "cheyenne-wyoming",
  ]);
});

test("hearthProductionFeedback: thumbnail replies require exactly five concepts and accept harmless markdown", () => {
  const parsed = resolveHearthProductionArtifactFeedback({
    action: "thumbnails",
    assistantText: [
      "### **THUMBNAIL_STRATEGY**",
      "- **Episode promise:** Explain the approved episode faithfully.",
      "- **Intended viewer:** Curious documentary viewers.",
      "- **Curiosity mechanism:** An unresolved visual contrast.",
      "- **Editorial positioning:** Evidence-led and restrained.",
      "- **Truthful connection:** Every image maps to the script.",
      "- **Prohibited exaggerations:** No invented outcomes.",
      ...Array.from({ length: 5 }, (_, index) => [
        `### **THUMBNAIL_0${index + 1}**`,
        `- **Headline:** Smoke and Signals ${index + 1}`,
        `- **Subject:** Documentary subject ${index + 1}`,
        `- **Focal action:** Distinct action ${index + 1}`,
        `- **Composition:** Distinct editorial scene ${index + 1}`,
        `- **Emotional tone:** Restrained urgency ${index + 1}`,
        `- **Visual hierarchy:** One focal subject ${index + 1}`,
        `- **Title compatibility:** Clear negative space ${index + 1}`,
        `- **Integrity rationale:** Supported by the approved script ${index + 1}`,
        `- **Render direction:** Clean artwork without text ${index + 1}`,
        `- **Mood/style:** urgent editorial still ${index + 1}`,
      ].join("\n")),
    ].join("\n\n"),
  });

  assert.equal(parsed.shouldRefreshEpisodePackage, true);
  assert.equal(parsed.warning, null);

  const partial = validateHearthProductionArtifactOutput({
    action: "thumbnails",
    assistantText: "THUMBNAIL_01\nHeadline: One\nImage concept: Only one\nMood/style: editorial",
  });
  assert.equal(partial.ok, false);

  const empty = resolveHearthProductionArtifactFeedback({
    action: "thumbnails",
    assistantText: "A few thumbnail ideas, but not in the expected block format.",
  });

  assert.match(empty.warning ?? "", /exactly five complete, distinct concept briefs/i);
});
