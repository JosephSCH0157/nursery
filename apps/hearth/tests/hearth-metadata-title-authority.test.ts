import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeMetadataTitlesForSave,
  updateMetadataTitleText,
} from "../src/hooks/visuals/useMetadataWorkspace";

test("editing an episode title does not manufacture thumbnail copy", () => {
  const [updated] = updateMetadataTitleText([{
    id: "title-a", label: "A", text: "Old title", thumbnail_text: null, is_primary: true,
  }], "title-a", "Why Is Gasoline So Expensive in the United States?");
  assert.equal(updated?.thumbnail_text, null);
  assert.equal(normalizeMetadataTitlesForSave([updated!])[0]?.thumbnail_text, null);
});

test("editing an episode title preserves independently authored thumbnail copy", () => {
  const [updated] = updateMetadataTitleText([{
    id: "title-a", label: "A", text: "Old title", thumbnail_text: "WHY SO EXPENSIVE?", is_primary: true,
  }], "title-a", "Why Is Gasoline So Expensive in the United States?");
  assert.equal(updated?.thumbnail_text, "WHY SO EXPENSIVE?");
  assert.equal(normalizeMetadataTitlesForSave([updated!])[0]?.thumbnail_text, "WHY SO EXPENSIVE?");
});
