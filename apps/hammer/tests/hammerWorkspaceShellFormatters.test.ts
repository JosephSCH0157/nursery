import assert from "node:assert/strict";
import test from "node:test";
import {
  compactHistoryActionLabel,
  formatHistoryEntryScope,
  formatOutputLayerLabelFromRecipeRef,
  formatStudioRackModuleLabel,
  resolveLaneGaps,
} from "../src/editor/hammerWorkspaceShellFormatters";

test("workspace shell formatters preserve editorial labels", () => {
  assert.equal(formatOutputLayerLabelFromRecipeRef("speaker_solo:s1"), "Solo Mode - S1");
  assert.equal(formatOutputLayerLabelFromRecipeRef("speaker_interview:s1->s2"), "Interview Mode - S1 -> S2");
  assert.equal(formatStudioRackModuleLabel("tubeMicCharacter"), "Tube Mic Character");
  assert.equal(compactHistoryActionLabel("12345678901234567890123456789"), "1234567890123456789012345...");
  assert.equal(formatHistoryEntryScope({ affectedSegmentIds: ["s1"], affectedPlacementIds: ["p1"] } as never), "1 segment, 1 placement");
});

test("lane gaps are clamped and stable", () => {
  assert.deepEqual(resolveLaneGaps([
    { startSec: 2, endSec: 4 },
    { startSec: 3, endSec: 6 },
    { startSec: 8, endSec: 12 },
  ], 10), [
    { id: "gap-0-0.00-2.00", startSec: 0, endSec: 2 },
    { id: "gap-2-6.00-8.00", startSec: 6, endSec: 8 },
  ]);
});
