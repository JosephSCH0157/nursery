import assert from "node:assert/strict";
import { test } from "node:test";
import { hammerShortOutputTimeToSourceTime, hammerShortSourceTimeToOutputTime, normalizeHammerShortTimingMap } from "../src/editor/hammerShortTimingMap";

const map = normalizeHammerShortTimingMap({ version: 1, intervals: [
  { segment_id: "a", source_start_sec: 18, source_end_sec: 20, output_start_sec: 0, output_end_sec: 2 },
  { segment_id: "b", source_start_sec: 40, source_end_sec: 50, output_start_sec: 2, output_end_sec: 12 },
] });

test("maps child-relative transport through discontinuous source intervals", () => {
  assert.ok(map);
  assert.equal(hammerShortOutputTimeToSourceTime(map, 0), 18);
  assert.equal(hammerShortOutputTimeToSourceTime(map, 1), 19);
  assert.equal(hammerShortOutputTimeToSourceTime(map, 2), 20);
  assert.equal(hammerShortOutputTimeToSourceTime(map, 2.5), 40.5);
  assert.equal(hammerShortOutputTimeToSourceTime(map, 99), 50);
  assert.equal(hammerShortSourceTimeToOutputTime(map, 45), 7);
  assert.equal(hammerShortSourceTimeToOutputTime(map, 30), 2);
});

test("rejects malformed and overlapping output authority", () => {
  assert.equal(normalizeHammerShortTimingMap({ version: 1, intervals: [] }), null);
  assert.equal(normalizeHammerShortTimingMap({ version: 1, intervals: [
    { segment_id: "a", source_start_sec: 0, source_end_sec: 2, output_start_sec: 0, output_end_sec: 2 },
    { segment_id: "b", source_start_sec: 3, source_end_sec: 4, output_start_sec: 1, output_end_sec: 2 },
  ] }), null);
  assert.equal(normalizeHammerShortTimingMap({ version: 1, intervals: [{ segment_id: "a", source_start_sec: 0, source_end_sec: Number.NaN, output_start_sec: 0, output_end_sec: 1 }] }), null);
});
