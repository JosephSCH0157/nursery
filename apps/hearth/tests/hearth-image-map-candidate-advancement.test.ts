import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildEpisodeImagesWorkspaceViewModel,
  type EpisodeImagesWorkspaceViewModel,
  nextUnresolvedEpisodeImageId,
} from "../src/lib/hearth-episode-images-view-model";
import type { EpisodeImageMapEntry } from "../src/lib/episode-package-v2";

function entry(id: string, selected = false): EpisodeImageMapEntry {
  return {
    id,
    anchor: `Moment ${id}`,
    script_anchor: null,
    beat_anchor: null,
    anchor_scope: "global",
    purpose: "context",
    description: `Suggested image ${id}`,
    visual_intent: `Purpose ${id}`,
    prompt_basis: `Prompt ${id}`,
    intent: "cutaway",
    source_type: "ai",
    origin: "hearth",
    visual_priority: "supporting",
    visual_type: "still_image",
    section_intent_note: null,
    beat_order: Number(id),
    paragraph_beat_order: Number(id),
    candidate_assets: [
      {
        asset_id: `${id}-0`,
        path: `assets/${id}-0.png`,
        source: "ai",
      },
    ],
    selected_asset_id: selected ? `${id}-0` : null,
    status: selected ? "selected" : "candidates_generated",
    placement_hint: null,
  };
}

test("guided candidate-selection transitions are preserved in the focused hook", () => {
  const source = readFileSync(resolve(process.cwd(), "src/hooks/visuals/useImageMapCandidateActions.ts"), "utf8");

  assert.match(source, /setImageMapExportMessage\(`Image \$\{completedNumber\} complete\. Image \$\{nextNumber\} is ready\.`\)/);
  assert.match(source, /setImageMapExportMessage\("Episode images complete\. B-roll is ready\."\)/);
  assert.match(source, /if \(!selected\.ok\)[\s\S]*setSelectedImageMapEntryId\(currentEntryId\)/);
  assert.match(source, /if \(!selected\.ok\)[\s\S]*selected\.reason === "conflict"/);
});

test("progress model advances from image 1 to image 2 and then to stage completion", () => {
  const entries = [entry("1", true), entry("2", false), entry("3", false)];
  assert.equal(nextUnresolvedEpisodeImageId(entries, "1"), "2");

  const complete = buildEpisodeImagesWorkspaceViewModel({
    entries: [entry("1", true), entry("2", true), entry("3", true)],
    activeEntryId: "3",
  });
  assert.equal(complete.progress.label, "Episode images complete");
});

test("reload selects the first unresolved canonical image", () => {
  const entries = [entry("1", true), entry("2", false), entry("3", false)];
  const model = buildEpisodeImagesWorkspaceViewModel({
    entries,
    activeEntryId: null,
  });

  assert.equal(model.activeItem?.id, "2");
});

test("completed queue items remain reviewable while unresolved work remains", () => {
  const entries = [entry("1", true), entry("2", false), entry("3", false)];
  const model: EpisodeImagesWorkspaceViewModel = buildEpisodeImagesWorkspaceViewModel({
    entries,
    activeEntryId: "1",
  });

  assert.equal(model.activeItem?.id, "1");
  assert.equal(model.stageComplete, false);
});

test("advancement helpers do not mutate candidate or selected-asset provenance payload", () => {
  const entries = [entry("1", true), entry("2", false)];
  const snapshot = JSON.parse(JSON.stringify(entries)) as EpisodeImageMapEntry[];

  void nextUnresolvedEpisodeImageId(entries, "1");

  assert.deepEqual(entries, snapshot);
});
