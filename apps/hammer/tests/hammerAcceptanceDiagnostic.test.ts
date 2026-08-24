import assert from "node:assert/strict";
import { buildHammerAcceptanceDiagnostic } from "../src/editor/hammerAcceptanceDiagnostic";

const diagnostic = buildHammerAcceptanceDiagnostic({
  transcriptSegments: 137,
  canonicalPlacements: 29,
  mountedCompositionClips: 28,
  uncertainCompositionClips: 2,
  undoDepth: 1,
  redoDepth: 0,
  historyStatus: "Canonical history installed.",
  historyHeadEntryId: "head:sequence-1",
});
assert.equal(diagnostic.transcriptSegments, 137);
assert.equal(diagnostic.canonicalPlacements, 29);
assert.equal(diagnostic.mountedCompositionClips, 28);
assert.equal(diagnostic.uncertainCompositionClips, 2);
assert.equal(diagnostic.undoDepth, 1);
assert.equal(diagnostic.redoDepth, 0);
assert.equal(diagnostic.historyCurrentHeadMismatch, false);
assert.equal(buildHammerAcceptanceDiagnostic({ ...diagnostic, historyStatus: "history_current_head_mismatch" }).historyCurrentHeadMismatch, true);
console.log("Hammer acceptance diagnostic tests passed.");
