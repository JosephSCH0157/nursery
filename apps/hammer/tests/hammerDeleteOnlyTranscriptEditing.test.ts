import assert from "node:assert/strict";
import type { HammerTranscriptSegment } from "../../../packages/contracts/hammer/transcript.contract";
import {
  deriveDeleteOnlyTranscriptCutSelection,
  resolveDeleteOnlyTranscriptDeletion,
  resolveDeleteOnlyTranscriptSelectionFromTexts,
  tokenizeDeleteOnlyTranscriptText,
} from "../src/editor/hammerDeleteOnlyTranscriptEditing";

function buildSegment(overrides?: Partial<HammerTranscriptSegment>): HammerTranscriptSegment {
  return {
    segment_id: "seg_001",
    speaker: "Host",
    text: "alpha beta gamma delta",
    start_sec: 10,
    end_sec: 14,
    ...overrides,
  };
}

function assertClose(actual: number | undefined, expected: number): void {
  assert.ok(typeof actual === "number");
  assert.ok(Math.abs(actual - expected) < 0.000001, `Expected ${expected}, received ${actual}`);
}

function buildWaveformProxy(peaks: number[], bucketDurationSec = 0.05) {
  return {
    version: "v1" as const,
    duration_sec: peaks.length * bucketDurationSec,
    bucket_count: peaks.length,
    bucket_duration_sec: bucketDurationSec,
    channel_mode: "mono_mixdown" as const,
    peaks,
  };
}

async function testTokenization() {
  const tokens = tokenizeDeleteOnlyTranscriptText("alpha beta, gamma");
  assert.deepEqual(tokens.map((token) => token.text), ["alpha", "beta,", "gamma"]);
  assert.equal(tokens[1]?.start, 6);
  assert.equal(tokens[1]?.end, 11);
}

async function testSelectionDeletionRemovesOverlappingTokens() {
  const deletion = resolveDeleteOnlyTranscriptDeletion({
    text: "alpha beta gamma delta",
    selectionStart: 7,
    selectionEnd: 16,
    direction: "selection",
  });
  assert.ok(deletion);
  assert.equal(deletion?.nextText, "alpha delta");
  assert.equal(deletion?.deletedText, "beta gamma");
  assert.equal(deletion?.deletedTokenCount, 2);
  assert.equal(deletion?.startTokenIndex, 1);
  assert.equal(deletion?.endTokenIndexExclusive, 3);
}

async function testBackwardDeletionRemovesPreviousToken() {
  const deletion = resolveDeleteOnlyTranscriptDeletion({
    text: "alpha beta gamma",
    selectionStart: 11,
    selectionEnd: 11,
    direction: "backward",
  });
  assert.ok(deletion);
  assert.equal(deletion?.nextText, "alpha gamma");
  assert.equal(deletion?.deletedText, "beta");
}

async function testForwardDeletionRemovesNextToken() {
  const deletion = resolveDeleteOnlyTranscriptDeletion({
    text: "alpha beta gamma",
    selectionStart: 6,
    selectionEnd: 6,
    direction: "forward",
  });
  assert.ok(deletion);
  assert.equal(deletion?.nextText, "alpha gamma");
  assert.equal(deletion?.deletedText, "beta");
}

async function testCutSelectionFollowsTokenSpan() {
  const deletion = resolveDeleteOnlyTranscriptDeletion({
    text: "alpha beta gamma delta",
    selectionStart: 6,
    selectionEnd: 16,
    direction: "selection",
  });
  assert.ok(deletion);
  const cut = deriveDeleteOnlyTranscriptCutSelection({
    segment: buildSegment(),
    deletion: deletion!,
  });
  assert.ok(cut);
  assertClose(cut?.startSec, 10.985);
  assertClose(cut?.endSec, 13.03);
}

async function testInitialFillerCutSelectionAllowsWaveformExpansionBeyondTokenBoundary() {
  const segment = buildSegment({
    text: "um alpha beta gamma",
    start_sec: 0,
    end_sec: 2,
  });
  const deletion = resolveDeleteOnlyTranscriptDeletion({
    text: segment.text,
    selectionStart: 0,
    selectionEnd: 2,
    direction: "selection",
  });
  assert.ok(deletion);

  const peaks = new Array(60).fill(0.62);
  peaks[0] = 0.01;
  peaks[12] = 0.01; // ~0.625s; beyond first-token seed boundary.
  const cut = deriveDeleteOnlyTranscriptCutSelection({
    segment,
    deletion: deletion!,
    editKind: "filler",
    waveformProxy: buildWaveformProxy(peaks),
    audioDurationSec: 2,
  });
  assert.ok(cut);
  assert.equal((cut?.endSec ?? 0) > 0.58, true);
  assert.equal((cut?.endSec ?? 0) < 0.9, true);
}

async function testSelectionFromBeforeAndAfterTexts() {
  const selection = resolveDeleteOnlyTranscriptSelectionFromTexts({
    beforeText: "um we should start now",
    afterText: "we should start now",
  });
  assert.ok(selection);
  assert.equal(selection?.selectionStart, 0);
  assert.equal(selection?.selectionEnd, 2);
  assert.equal(selection?.selectedText, "um");
}

async function testSelectionFromBeforeAndNullAfterDeletesWholeRange() {
  const selection = resolveDeleteOnlyTranscriptSelectionFromTexts({
    beforeText: "let me start that again",
    afterText: null,
  });
  assert.ok(selection);
  assert.equal(selection?.selectionStart, 0);
  assert.equal(selection?.selectionEnd, "let me start that again".length);
  assert.equal(selection?.selectedText, "let me start that again");
}

async function run() {
  await testTokenization();
  await testSelectionDeletionRemovesOverlappingTokens();
  await testBackwardDeletionRemovesPreviousToken();
  await testForwardDeletionRemovesNextToken();
  await testCutSelectionFollowsTokenSpan();
  await testInitialFillerCutSelectionAllowsWaveformExpansionBeyondTokenBoundary();
  await testSelectionFromBeforeAndAfterTexts();
  await testSelectionFromBeforeAndNullAfterDeletesWholeRange();
  // eslint-disable-next-line no-console
  console.log("Hammer delete-only transcript editing tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer delete-only transcript editing tests failed:", error);
  process.exit(1);
});
