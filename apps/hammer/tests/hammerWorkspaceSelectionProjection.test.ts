import assert from "node:assert/strict";
import { resolveHammerEffectiveVisualSelection } from "../src/editor/hammerWorkspaceSelectionProjection";

assert.equal(resolveHammerEffectiveVisualSelection({ transportActive: false, playheadClipId: "playing", selectedClipId: "selected" }), "selected");
assert.equal(resolveHammerEffectiveVisualSelection({ transportActive: true, playheadClipId: "playing", selectedClipId: "selected" }), "playing");
assert.equal(resolveHammerEffectiveVisualSelection({ transportActive: true, playheadClipId: null, selectedClipId: "selected" }), "selected");
console.log("Hammer workspace selection projection tests passed.");
