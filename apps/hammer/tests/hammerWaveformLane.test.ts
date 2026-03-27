import { resolveWaveformSeekTime } from "../src/editor/HammerWaveformLane";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

{
  const atStart = resolveWaveformSeekTime({
    clientX: 10,
    laneLeftPx: 10,
    laneScrollLeftPx: 0,
    canvasWidthPx: 1000,
    durationSec: 10,
  });
  assertEqual(atStart, 0, "click at lane start should seek to 0s");
}

{
  const atMid = resolveWaveformSeekTime({
    clientX: 510,
    laneLeftPx: 10,
    laneScrollLeftPx: 0,
    canvasWidthPx: 1000,
    durationSec: 10,
  });
  assertEqual(atMid, 5, "click at 50% should seek to midpoint");
}

{
  const nearEnd = resolveWaveformSeekTime({
    clientX: 960,
    laneLeftPx: 10,
    laneScrollLeftPx: 0,
    canvasWidthPx: 1000,
    durationSec: 10,
  });
  assertEqual(nearEnd, 9.5, "click near 95% should seek near end");
}

{
  const clampedLow = resolveWaveformSeekTime({
    clientX: -100,
    laneLeftPx: 10,
    laneScrollLeftPx: 0,
    canvasWidthPx: 1000,
    durationSec: 10,
  });
  assertEqual(clampedLow, 0, "seek should clamp below 0 to start");
}

{
  const clampedHigh = resolveWaveformSeekTime({
    clientX: 2000,
    laneLeftPx: 10,
    laneScrollLeftPx: 0,
    canvasWidthPx: 1000,
    durationSec: 10,
  });
  assertEqual(clampedHigh, 10, "seek should clamp beyond end to duration");
}

{
  const withScroll = resolveWaveformSeekTime({
    clientX: 110,
    laneLeftPx: 10,
    laneScrollLeftPx: 400,
    canvasWidthPx: 1000,
    durationSec: 10,
  });
  assertEqual(withScroll, 5, "seek should account for horizontal scroll offset");
}

{
  const invalidDuration = resolveWaveformSeekTime({
    clientX: 110,
    laneLeftPx: 10,
    laneScrollLeftPx: 0,
    canvasWidthPx: 1000,
    durationSec: 0,
  });
  assertEqual(invalidDuration, null, "invalid duration should return null");
}

{
  const invalidWidth = resolveWaveformSeekTime({
    clientX: 110,
    laneLeftPx: 10,
    laneScrollLeftPx: 0,
    canvasWidthPx: 0,
    durationSec: 10,
  });
  assertEqual(invalidWidth, null, "invalid canvas width should return null");
}

console.log("Hammer waveform lane tests passed.");
