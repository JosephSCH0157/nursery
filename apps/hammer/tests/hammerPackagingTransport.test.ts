import assert from "node:assert/strict";
import {
  activeMediaTimeToTransportTime,
  resolvePackagingTransport,
  transportTimeToActiveMediaTime,
} from "../src/editor/hammerPackagingTransport";

const resolve = (playheadSec: number) => resolvePackagingTransport({
  introDurationSec: 1.25,
  compositionDurationSec: 10,
  outroDurationSec: 2.5,
  playheadSec,
});

assert.equal(resolve(1.249).phase, "intro");
assert.equal(resolve(1.25).phase, "composition");
assert.equal(resolve(11.249).phase, "composition");
assert.equal(resolve(11.25).phase, "outro");
assert.equal(resolve(13.749).phase, "outro");
assert.equal(resolve(13.75).phase, "complete");
assert.equal(resolve(99).phase, "complete");
assert.equal(transportTimeToActiveMediaTime({ transport: resolve(13.75), timeSec: 13.75 }), 2.5);
assert.equal(activeMediaTimeToTransportTime({ transport: resolve(13.75), timeSec: 0 }), 13.75);

console.log("Hammer packaging transport tests passed.");
