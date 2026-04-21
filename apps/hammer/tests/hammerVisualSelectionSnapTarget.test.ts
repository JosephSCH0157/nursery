import assert from "node:assert/strict";
import { resolveImageFirstEditablePreviewMoment } from "../src/editor/hammerWorkspaceShellVisualUtils";
import { resolveVisualSelectionSnapTime } from "../src/editor/useHammerWorkspaceShellSelection";

{
  const next = resolveVisualSelectionSnapTime({
    currentCompositionPlayheadSec: 12.4,
    defaultStartSec: 12,
    defaultEndSec: 16,
    snapTarget: {
      editableStartSec: 12,
      editableEndSec: 16,
      firstVisibleEditableSec: 12.2,
      preservePlayheadIfWithinEditableWindow: true,
    },
  });
  assert.equal(next, 12.4);
}

{
  const next = resolveVisualSelectionSnapTime({
    currentCompositionPlayheadSec: 5,
    defaultStartSec: 12,
    defaultEndSec: 16,
    snapTarget: {
      editableStartSec: 12,
      editableEndSec: 16,
      firstVisibleEditableSec: 12.25,
      preservePlayheadIfWithinEditableWindow: true,
    },
  });
  assert.equal(next, 12.25);
}

{
  const next = resolveVisualSelectionSnapTime({
    currentCompositionPlayheadSec: 2,
    defaultStartSec: 9,
    defaultEndSec: 13,
    snapTarget: {
      editableStartSec: 9,
      editableEndSec: 13,
      preservePlayheadIfWithinEditableWindow: true,
    },
  });
  assert.equal(next, 9);
}

{
  const next = resolveVisualSelectionSnapTime({
    currentCompositionPlayheadSec: 3,
    defaultStartSec: 10,
    defaultEndSec: 14,
    snapTarget: {
      editableStartSec: 10,
      editableEndSec: 14,
      firstVisibleEditableSec: 18,
      preservePlayheadIfWithinEditableWindow: true,
    },
  });
  assert.equal(next, 10);
}

{
  const firstEditable = resolveImageFirstEditablePreviewMoment({
    startSec: 20,
    endSec: 23,
    animationPreset: "fade_in",
  });
  assert.ok(typeof firstEditable === "number");
  assert.ok(firstEditable! > 20 && firstEditable! < 23);
}

{
  const firstEditable = resolveImageFirstEditablePreviewMoment({
    startSec: 20,
    endSec: 23,
    animationPreset: "none",
  });
  assert.equal(firstEditable, null);
}

// eslint-disable-next-line no-console
console.log("Hammer visual selection snap target tests passed.");
