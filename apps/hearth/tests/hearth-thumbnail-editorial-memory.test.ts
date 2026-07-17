import assert from "node:assert/strict";
import test from "node:test";
import { critiqueThumbnailDirection, type ThumbnailMemoryProjection } from "../src/lib/hearth-thumbnail-editorial-memory";
import type { ThumbnailCreativeBrief, ThumbnailRenderRecipe } from "../src/lib/episode-package-v3";

const brief: ThumbnailCreativeBrief = {
  id: "brief", revision: 1, strategy_id: "strategy", strategy_revision: 1, concept_slot: 1,
  subject_direction: "A host at a microphone", focal_action: "The host notices a surprising chart",
  composition_direction: "close-up", emotional_tone: "curious", visual_hierarchy: "one face and one chart",
  title_compatibility: "negative space at left", expectation_integrity_rationale: "The chart appears in the approved episode.",
  provider_neutral_render_direction: "clean editorial photograph", subject_classification: "creator_face",
  composition_classification: "close_up", dominant_colors: ["orange", "navy"], created_at: "2026-07-17T09:00:00.000Z", provenance: {},
};

const recipe = {
  treatment: { typography: { font: "Inter", weight: 800 }, placement: {}, safe_zone: {}, shadow: {}, treatment: {} },
} as ThumbnailRenderRecipe;

function projection(count: number): ThumbnailMemoryProjection {
  return {
    launchFacts: Array.from({ length: count }, (_, index) => ({
      id: `fact-${index}`, workpiece_id: `workpiece-${index}`, launch_identity: `launch-${index}`,
      launch_snapshot_hash: "a".repeat(64), published_at: null, destination: "youtube", recorded_at: `2026-07-${16 - index}T09:00:00.000Z`,
      fact_json: { subject_classification: "creator_face", composition_classification: "close_up",
        dominant_colors: ["orange"], typography_treatment: { font: "Inter", weight: 800 } },
    })),
    activeInterpretations: [{ id: "note", interpretation_key: "creator-face-fatigue", revision: 2, supersedes_id: "note-v1",
      observation_type: "fatigue", evidence_launch_identities: ["launch-0", "launch-1"],
      interpretation_json: { summary: "Creator-face close-ups have dominated recent launches." }, created_at: "2026-07-17T09:00:00.000Z" }],
  };
}

test("editorial critique separates measurements, heuristics, and revisioned observations", () => {
  const critique = critiqueThumbnailDirection({ projection: projection(4), currentBrief: brief, currentRecipe: recipe });
  assert.deepEqual(critique.measurements.find((entry) => entry.label === "Matching subject class"), { label: "Matching subject class", value: "4" });
  assert.ok(critique.heuristicGuidance.some((entry) => entry.includes("creator_face")));
  assert.ok(critique.heuristicGuidance.some((entry) => entry.includes("typography")));
  assert.deepEqual(critique.historicalObservations, ["Creator-face close-ups have dominated recent launches."]);
  assert.equal(JSON.stringify(critique).toLowerCase().includes("predicted ctr"), false);
});

test("editorial memory remains advisory when history is empty", () => {
  const critique = critiqueThumbnailDirection({ projection: { launchFacts: [], activeInterpretations: [] }, currentBrief: brief, currentRecipe: recipe });
  assert.equal(critique.heuristicGuidance.length, 0);
  assert.equal(critique.historicalObservations.length, 0);
  assert.equal(critique.measurements[0]?.value, "0");
});
