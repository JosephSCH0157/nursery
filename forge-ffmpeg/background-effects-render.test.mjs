import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./background-effects-render.py", import.meta.url), "utf8");
const server = readFileSync(new URL("./server.mjs", import.meta.url), "utf8");
assert.match(source, /segment_for_video/);
assert.match(source, /timestamp_ms = int\(round\(frame_count \* 1000 \/ fps\)\)/);
assert.match(source, /background_effect_mask_confidence_low/);
assert.match(source, /background_effect_model_sha_mismatch/);
assert.match(source, /temporal_reset_frame_indices/);
assert.match(source, /replacement_image/);
assert.doesNotMatch(source, /http[s]?:\/\//);
assert.match(server, /\/render\/background-effect/);
assert.match(server, /x-forge-render-evidence/);
console.log("forge-ffmpeg background-effects renderer contract tests passed");
