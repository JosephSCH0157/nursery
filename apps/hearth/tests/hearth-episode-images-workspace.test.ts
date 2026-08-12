import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { buildEpisodeImagesWorkspaceViewModel, nextUnresolvedEpisodeImageId, preferredEpisodeImageIdAfterReadback } from "../src/lib/hearth-episode-images-view-model";
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

test("Episode Images derives strict progress and presents a retained selected image after readback", () => {
  const entries = [entry("1", true, 1), entry("2"), entry("3", false, 2)];
  const model = buildEpisodeImagesWorkspaceViewModel({ entries, activeEntryId: null });
  assert.deepEqual(model.progress, { ready: 1, total: 3, label: "1 of 3 ready" });
  assert.equal(model.activeItem?.id, "1");
  assert.equal(model.items[0]?.selectedAssetPath, "assets/1-0.png");
  assert.equal(model.items[2]?.status, "options_ready");
  assert.equal(model.stageComplete, false);
});

test("all retained selections recover their exact candidate assets without regeneration", () => {
  const entries = Array.from({ length: 19 }, (_, index) => entry(String(index + 1), index >= 3, index >= 3 ? 2 : 0));
  assert.equal(preferredEpisodeImageIdAfterReadback(entries), "4");
  const model = buildEpisodeImagesWorkspaceViewModel({ entries, activeEntryId: null });
  assert.equal(model.progress.ready, 16);
  assert.equal(model.items.filter((item) => item.status === "selected" || item.status === "complete").length, 16);
  for (const [index, item] of model.items.slice(3).entries()) {
    assert.equal(item.selectedAssetPath, `assets/${item.id}-0.png`);
    assert.equal(entries[index + 3]?.candidate_assets.length, 2);
  }
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
  assert.match(panel, /"Generate image"/);
  assert.match(panel, />Upload an image</);
  assert.match(panel, /Forge does not yet have a licensed stock-image provider/);
  const guided = panel.match(/if \(!manualOnly\) \{[\s\S]*?\n  \}\n  let primaryActionButton/)?.[0] ?? "";
  assert.doesNotMatch(guided, /onGenerateCandidates\("stock"\)/);
  assert.match(panel, /"Use this image"/);
  assert.match(panel, /selectedEntry\.selected_asset_id/);
  assert.match(panel, /selectedCandidate/);
  assert.match(panel, /!selectedEntry\.selected_asset_id/);
  assert.match(surface, /Episode images complete\. Reference Material is ready\./);
});

test("episode-image prompt language is distinct from thumbnail language", () => {
  const profiles = readFileSync(resolve(process.cwd(), "src/lib/hearth-visual-provider-profiles.ts"), "utf8");
  assert.match(profiles, /intendedUse === "timeline_image" \? "an episode visual supporting a script moment"/);
  assert.match(profiles, /"a podcast thumbnail concept"/);
});

test("outside episode images are contained in the selected frame and retain fit provenance", () => {
  const actions = readFileSync(resolve(process.cwd(), "src/hooks/visuals/useImageMapCandidateActions.ts"), "utf8");
  const repository = readFileSync(resolve(process.cwd(), "src/lib/hearth-image-map-repo.ts"), "utf8");
  const styles = readFileSync(resolve(process.cwd(), "src/routes/HearthShell.css"), "utf8");

  assert.match(actions, /prepareOutsideImageForFrame\(file, targetWidth, targetHeight\)/);
  assert.match(actions, /preparationEvidence: prepared\.fitEvidence/);
  assert.match(repository, /preparation_evidence: args\.preparationEvidence \?\? null/);
  assert.match(styles, /\.hs-episode-image-preview img\{object-fit:contain\}/);
  assert.match(styles, /\.hs-imap-candidate-image \{[\s\S]*?object-fit: contain;/);
});
