import assert from "node:assert/strict";
import test from "node:test";
import type { EpisodeSeoTitle } from "../src/lib/episode-package-v2";
import {
  applySuggestionToTitleSlot,
  partitionMetadataTitles,
  shouldConfirmTitleSlotReplacement,
} from "../src/lib/hearth-metadata-titles";
import { mergeGeneratedSeoTitlesIntoSlots } from "../src/lib/episode-package-v2";

function buildTitles(): EpisodeSeoTitle[] {
  return [
    { id: "seo-title-a", label: "A", text: "Alpha title", is_primary: true },
    { id: "seo-title-b", label: "B", text: "Bravo title", is_primary: false },
    { id: "seo-title-c", label: "C", text: "Charlie title", is_primary: false },
    { id: "seo-title-s1", label: "SUGGESTION_1", text: "Fresh suggestion", is_primary: false },
  ];
}

test("metadata titles: generated suggestions are separated from A/B/C slots", () => {
  const { slotTitles, generatedSuggestions } = partitionMetadataTitles(buildTitles());

  assert.deepEqual(slotTitles.map((entry) => entry.label), ["A", "B", "C"]);
  assert.deepEqual(generatedSuggestions.map((entry) => entry.label), ["SUGGESTION_1"]);
});

test("metadata titles: assigning suggestion to Title A populates Title A and keeps primary selection lane on slots", () => {
  const updated = applySuggestionToTitleSlot({
    titles: buildTitles(),
    suggestionId: "seo-title-s1",
    slotLabel: "A",
  });

  assert.ok(updated);
  assert.equal(updated?.find((entry) => entry.label === "A")?.text, "Fresh suggestion");
  assert.equal(updated?.find((entry) => entry.label === "A")?.is_primary, true);
  assert.equal(updated?.find((entry) => entry.label === "SUGGESTION_1")?.is_primary, false);
});

test("metadata titles: replacing a populated slot requests confirmation", () => {
  assert.equal(shouldConfirmTitleSlotReplacement("Existing title", "New title"), true);
  assert.equal(shouldConfirmTitleSlotReplacement("Existing title", "Existing title"), false);
  assert.equal(shouldConfirmTitleSlotReplacement("", "New title"), false);
});

test("metadata titles: generated titles replace A/B/C placeholders and retain extra suggestions", () => {
  const generated = ["First real title", "Second real title", "Third real title", "Extra title"].map((text, index) => ({
    id: `generated-${index}`,
    label: `GENERATED_${index + 1}`,
    text,
    is_primary: false,
  }));
  const merged = mergeGeneratedSeoTitlesIntoSlots([], generated);
  assert.deepEqual(merged.slice(0, 3).map((title) => [title.label, title.text]), [
    ["A", "First real title"],
    ["B", "Second real title"],
    ["C", "Third real title"],
  ]);
  assert.equal(merged[3]?.text, "Extra title");
});
