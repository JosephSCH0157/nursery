import assert from "node:assert/strict";
import type { HammerTranscriptSegment } from "../../../packages/contracts/hammer/transcript.contract";
import {
  deriveDeleteOnlyTranscriptCutSelection,
  resolveDeleteOnlyTranscriptDeletion,
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
  assert.equal(cut?.startSec, 11);
  assert.equal(cut?.endSec, 13);
}

async function run() {
  await testTokenization();
  await testSelectionDeletionRemovesOverlappingTokens();
  await testBackwardDeletionRemovesPreviousToken();
  await testForwardDeletionRemovesNextToken();
  await testCutSelectionFollowsTokenSpan();
  // eslint-disable-next-line no-console
  console.log("Hammer delete-only transcript editing tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer delete-only transcript editing tests failed:", error);
  process.exit(1);
});