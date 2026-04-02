import assert from "node:assert/strict";
import { resolveSelectedPlacementId } from "../src/editor/hammerWorkspaceSelection";

{
  const ids = ["placement_a", "placement_b"];
  assert.equal(resolveSelectedPlacementId(ids, "placement_b"), "placement_b");
  assert.equal(resolveSelectedPlacementId(ids, "missing"), "placement_a");
  assert.equal(resolveSelectedPlacementId(ids, null), "placement_a");
  assert.equal(resolveSelectedPlacementId([], "placement_a"), null);
}

console.log("Hammer workspace selection tests passed.");
