import assert from "node:assert/strict";
import test from "node:test";
import { resolveSourceMediaTimeForCompositionTime } from "../src/editor/hammerCompositionMediaTimeAuthority";

test("composition time maps across removed source ranges", () => {
  const ranges = [{ startSec: 2, endSec: 4 }, { startSec: 7, endSec: 8 }];
  assert.equal(resolveSourceMediaTimeForCompositionTime({ compositionTimeSec: 1, removedSourceRanges: ranges }), 1);
  assert.equal(resolveSourceMediaTimeForCompositionTime({ compositionTimeSec: 3, removedSourceRanges: ranges }), 5);
  assert.equal(resolveSourceMediaTimeForCompositionTime({ compositionTimeSec: 6, removedSourceRanges: ranges }), 9);
});
