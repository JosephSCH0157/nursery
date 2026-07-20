import assert from "node:assert/strict";
import test from "node:test";
import { buildThumbnailDirections, creatorThumbnailError } from "../src/lib/hearth-thumbnail-workspace-view-model";

test("creator errors translate concurrency and distinction failures", () => {
  assert.match(creatorThumbnailError("Expected revision conflict"), /work is safe/i);
  assert.match(creatorThumbnailError("pairwise distinction failed"), /too similar/i);
});

test("focused direction builder pairs concepts and titles into three complete choices", () => {
  const concepts = ["Culprit", "Consequence", "Collapse"].map((headline, index) => ({
    concept_set_id: "set", concept_lineage_id: `line-${index}`, revision_number: 1,
    concept_revision_id: `concept-${index}`, headline, image_concept: `Visual ${index}`,
    creative_brief_id: `brief-${index}`, creative_brief_revision: 1, strategy_id: "strategy", strategy_revision: 1,
  }));
  const pkg = { seo: { titles: concepts.map((_, index) => ({ id: `title-${index}`, revision: 1, text: `Title ${index}`, thumbnail_text: `THUMB ${index}` })) }, thumbnail: {
    concept_revisions: concepts, creative_briefs: concepts.map((_, index) => ({ id: `brief-${index}`, revision: 1, subject_direction: `Subject ${index}`, emotional_tone: `Approach ${index}` })), creative_strategies: [],
  } } as never;
  const directions = buildThumbnailDirections(pkg, "set");
  assert.deepEqual(directions.map((entry) => entry.key), ["A", "B", "C"]);
  assert.deepEqual(directions.map((entry) => entry.thumbnailText), ["THUMB 0", "THUMB 1", "THUMB 2"]);
  assert.equal(directions[1]?.visual, "Subject 1");
});
