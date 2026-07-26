import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { buildEpisodeImagesWorkspaceViewModel, nextUnresolvedEpisodeImageId } from "../src/lib/hearth-episode-images-view-model";
import type { EpisodeImageMapEntry } from "../src/lib/episode-package-v2";

function entry(id: string, selected = false, candidates = 0): EpisodeImageMapEntry {
  return {
    id, anchor: `Moment ${id}`, script_anchor: null, anchor_scope: "global", purpose: "context",
    description: `Suggested image ${id}`, visual_intent: `Purpose ${id}`, prompt_basis: `Prompt ${id}`,
    intent: "cutaway", source_type: "ai", origin: "hearth", visual_priority: "supporting",
    visual_type: "still_image", section_intent_note: null, beat_order: Number(id), paragraph_beat_order: Number(id),
    candidate_assets: Array.from({ length: candidates }, (_, index) => ({ asset_id: `${id}-${index}`, path: `assets/${id}-${index}.png`, source: "ai" as const })),
    selected_asset_id: selected ? `${id}-0` : null, status: selected ? "selected" : candidates ? "candidates_generated" : "mapped",
  };
}

test("Episode Images derives strict progress and first unresolved item from canonical selections", () => {
  const entries = [entry("1", true, 1), entry("2"), entry("3", false, 2)];
  const model = buildEpisodeImagesWorkspaceViewModel({ entries, activeEntryId: null });
  assert.deepEqual(model.progress, { ready: 1, total: 3, label: "1 of 3 ready" });
  assert.equal(model.activeItem?.id, "2");
  assert.equal(model.items[0]?.selectedAssetPath, "assets/1-0.png");
  assert.equal(model.items[2]?.status, "options_ready");
  assert.equal(model.stageComplete, false);
});

test("completion and next-item navigation require selected assets", () => {
  const entries = [entry("1", true, 1), entry("2", true, 1), entry("3")];
  assert.equal(nextUnresolvedEpisodeImageId(entries, "1"), "3");
  const complete = buildEpisodeImagesWorkspaceViewModel({ entries: entries.map((item) => item.id === "3" ? entry("3", true, 1) : item), activeEntryId: "3" });
  assert.equal(complete.stageComplete, true);
  assert.equal(complete.progress.label, "Episode images complete");
});

test("creator surface is guided and never routes stock through AI generation", () => {
  const panel = readFileSync(resolve(process.cwd(), "src/components/visuals/ImageMapPanel.tsx"), "utf8");
  const surface = readFileSync(resolve(process.cwd(), "src/views/surfaces/VisualsSurface.tsx"), "utf8");
  assert.match(panel, />Episode Images</);
  assert.match(panel, />Generate image</);
  assert.match(panel, />Upload an image</);
  assert.match(panel, /Forge does not yet have a licensed stock-image provider/);
  const guided = panel.match(/if \(!manualOnly\) \{[\s\S]*?\n  \}\n  let primaryActionButton/)?.[0] ?? "";
  assert.doesNotMatch(guided, /onGenerateCandidates\("stock"\)/);
  assert.match(panel, /"Use this image"/);
  assert.match(surface, /Episode images complete\. B-roll is ready\./);
});

test("episode-image prompt language is distinct from thumbnail language", () => {
  const profiles = readFileSync(resolve(process.cwd(), "src/lib/hearth-visual-provider-profiles.ts"), "utf8");
  assert.match(profiles, /intendedUse === "timeline_image" \? "an episode visual supporting a script moment"/);
  assert.match(profiles, /"a podcast thumbnail concept"/);
});
