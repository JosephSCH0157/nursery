import assert from "node:assert/strict";
import type { HammerDerivedTextLayer } from "../src/persistence/hammerPersistenceContract";
import { normalizeHammerOutputSelectionRef } from "../src/macros/hammerDerivedTranscriptLayers";

function layer(id: string, recipeRef: string, status: HammerDerivedTextLayer["status"]): HammerDerivedTextLayer {
  return {
    layer_id: id,
    recipe_ref: recipeRef,
    macro_kind: "filler_cleanup",
    status,
    created_at: "2026-03-23T00:00:00.000Z",
    based_on_transcript_id: "tx-1",
    summary: {
      changed_segment_count: 1,
      removal_count: 1,
      untouched_segment_count: 0,
    },
    changes: [
      {
        segment_id: "seg-1",
        original_text: "um hello",
        cleaned_text: "hello",
        operations: [
          {
            kind: "filler_removed",
            value: "um",
            start: 0,
            end: 2,
          },
        ],
      },
    ],
  };
}

async function testInvalidLayerSelectionClearsToRaw() {
  const normalized = normalizeHammerOutputSelectionRef({
    selection: {
      layerId: "layer-missing",
      sourceRecipeRef: "retake_cleanup",
    },
    layers: [layer("layer-1", "filler_cleanup", "review")],
  });

  assert.deepEqual(normalized, {
    layerId: null,
    sourceRecipeRef: null,
  });
}

async function run() {
  await testInvalidLayerSelectionClearsToRaw();
  // eslint-disable-next-line no-console
  console.log("Hammer output selection guard tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer output selection guard tests failed:", error);
  process.exit(1);
});
