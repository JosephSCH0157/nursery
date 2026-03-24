import assert from "node:assert/strict";
import type { HammerTranscriptSegment } from "../../../packages/contracts/hammer/transcript.contract";
import {
  previewSpeakerInterview,
  previewQuickClean,
  previewRemoveFillers,
  previewRemoveRetakes,
  previewShortenGaps,
  previewSpeakerSolo,
  previewTightenSelection,
} from "../src/editor/hammerCleanupTools";

function s(id: string, start: number, end: number, speaker: string, text: string): HammerTranscriptSegment {
  return { segment_id: id, start_sec: start, end_sec: end, speaker, text };
}

async function testShortenGapsDeterministic() {
  const segments = [
    s("a", 0, 1, "Host", "hello"),
    s("b", 2.2, 3, "Host", "next"),
  ];
  const first = previewShortenGaps(segments, { maxGapSec: 0.4, minPauseSec: 0.1, preserveDramaticPauses: false });
  const second = previewShortenGaps(segments, { maxGapSec: 0.4, minPauseSec: 0.1, preserveDramaticPauses: false });
  assert.deepEqual(first, second);
  assert.equal(first.summary.changedSegments, 1);
}

async function testFillerRemovalDeterministic() {
  const segments = [
    s("a", 0, 1.3, "Host", "Um I mean this is, like, fine."),
  ];
  const preview = previewRemoveFillers(segments, { aggressiveness: "medium", protectIntentionalPhrasing: true });
  assert.equal(preview.summary.changedSegments, 1);
  assert.equal(preview.resultSegments[0]?.text.includes("um"), false);
}

async function testRetakeRemovalDeterministic() {
  const segments = [
    s("a", 0, 1, "Host", "let me do that again"),
    s("b", 1.1, 2.1, "Host", "Final kept line"),
  ];
  const preview = previewRemoveRetakes(segments, {
    detection: "normal",
    preferLaterCleanerTake: true,
    honorExplicitRetakePhrases: true,
    sameSpeakerOnly: true,
  });
  assert.equal(preview.summary.removedSegments, 1);
  assert.equal(preview.resultSegments.some((segment) => segment.segment_id === "a"), false);
}

async function testQuickCleanOrderDeterministic() {
  const segments = [
    s("a", 0, 1, "Host", "uh intro"),
    s("b", 2.0, 3.0, "Host", "let me do that again"),
    s("c", 3.1, 4.0, "Host", "clean line"),
  ];
  const preview = previewQuickClean({
    segments,
    retakes: {
      detection: "normal",
      preferLaterCleanerTake: true,
      honorExplicitRetakePhrases: true,
      sameSpeakerOnly: true,
    },
    fillers: {
      aggressiveness: "medium",
      protectIntentionalPhrasing: true,
    },
    gaps: {
      maxGapSec: 0.4,
      minPauseSec: 0.1,
      preserveDramaticPauses: false,
    },
  });
  assert.ok(preview.summary.timeSavedSec >= 0.1);
  assert.equal(preview.label, "Quick Clean");
}

async function testTightenSelectionPreservesUnselectedSegments() {
  const segments = [
    s("a", 0, 1.2, "Host", "Intro stays untouched."),
    s("b", 1.2, 2.6, "Host", "Um I mean this this point is is clear."),
    s("c", 2.6, 3.1, "Host", "you know"),
    s("d", 3.1, 4.0, "Host", "Outro stays untouched."),
  ];

  const preview = previewTightenSelection({
    segments,
    segmentIds: ["b", "c"],
  });

  assert.equal(preview.label, "Tighten Selection");
  assert.ok(preview.summary.changedSegments >= 1);
  assert.ok(preview.summary.timeSavedSec >= 0.1);
  assert.ok(preview.metadata?.tightenSelection != null);
  assert.equal(preview.metadata?.tightenSelection?.removedFillers != null, true);
  assert.equal(preview.metadata?.tightenSelection?.collapsedRepetitions != null, true);
  assert.equal(preview.metadata?.tightenSelection?.mergedFragments != null, true);

  const first = preview.resultSegments.find((segment) => segment.segment_id === "a");
  const last = preview.resultSegments.find((segment) => segment.segment_id === "d");
  assert.equal(first?.text, "Intro stays untouched.");
  assert.equal(last?.text, "Outro stays untouched.");
  assert.equal(
    preview.resultSegments.some((segment) => segment.segment_id === "c"),
    false,
    "Filler-only fragment should be removable inside selected tighten span",
  );
}

async function testTightenSelectionRejectsInlineSpeakerTagAsTextMutationRisk() {
  const segments = [
    s("a", 0, 1.2, "Host", "normal line"),
    s("b", 1.2, 2.3, "Host", "this is [s1] not valid inline"),
  ];
  const preview = previewTightenSelection({
    segments,
    segmentIds: ["a", "b"],
  });
  assert.equal(preview.summary.changedSegments >= 0, true);
  assert.equal(
    preview.resultSegments.some((segment) => segment.text.includes("[s1]")),
    true,
    "Tighten should not rewrite structural tags; validator remains source of truth",
  );
}

async function testSpeakerSoloSuppressesNonTargetDeterministically() {
  const segments = [
    s("a", 0, 1.0, "S1", "Host setup."),
    s("b", 1.0, 1.6, "S2", "quick interjection"),
    s("c", 1.6, 2.8, "S1", "Host keeps going."),
    s("d", 2.8, 4.0, "S2", "Long guest segment."),
  ];
  const options = {
    targetSpeaker: "S1",
    collapseInterruptions: true,
    compressGaps: false,
    maxInterruptionSec: 0.8,
  } as const;
  const first = previewSpeakerSolo({ segments, options });
  const second = previewSpeakerSolo({ segments, options });
  assert.deepEqual(first, second, "Solo mode preview must be deterministic");
  assert.equal(first.label, "Solo Mode");
  assert.equal(first.metadata?.speakerSolo?.targetSpeaker, "S1");
  assert.equal(first.metadata?.speakerSolo?.suppressedSegments, 2);
  assert.equal(
    first.resultSegments.filter((segment) => segment.speaker === "S2").every((segment) => segment.is_disabled === true),
    true,
    "Non-target speakers should be suppressed in solo mode",
  );
}

async function testSpeakerInterviewTightensRespondentOnly() {
  const segments = [
    s("a", 0, 1.1, "S1", "How did that start?"),
    s("b", 1.1, 3.5, "S2", "Um I mean it started started when we were, you know, testing."),
    s("c", 3.5, 4.0, "S3", "yeah"),
    s("d", 4.0, 5.0, "S1", "What happened next?"),
  ];
  const preview = previewSpeakerInterview({
    segments,
    options: {
      hostSpeaker: "S1",
      respondentSpeaker: "S2",
      tightness: "medium",
      removeBackchannels: true,
      collapseInterruptions: true,
      maxInterruptionSec: 0.8,
    },
  });
  assert.equal(preview.label, "Interview Mode");
  assert.equal(preview.metadata?.speakerInterview?.hostSpeaker, "S1");
  assert.equal(preview.metadata?.speakerInterview?.respondentSpeaker, "S2");
  const hostA = preview.resultSegments.find((segment) => segment.segment_id === "a");
  assert.equal(hostA?.text, "How did that start?");
  const respondent = preview.resultSegments.find((segment) => segment.segment_id === "b");
  assert.equal(Boolean(respondent && respondent.text !== segments[1]?.text), true);
  const interruption = preview.resultSegments.find((segment) => segment.segment_id === "c");
  assert.equal(interruption?.is_disabled === true, true);
}

async function run() {
  await testShortenGapsDeterministic();
  await testFillerRemovalDeterministic();
  await testRetakeRemovalDeterministic();
  await testQuickCleanOrderDeterministic();
  await testTightenSelectionPreservesUnselectedSegments();
  await testTightenSelectionRejectsInlineSpeakerTagAsTextMutationRisk();
  await testSpeakerSoloSuppressesNonTargetDeterministically();
  await testSpeakerInterviewTightensRespondentOnly();
  // eslint-disable-next-line no-console
  console.log("Hammer cleanup tools tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer cleanup tools tests failed:", error);
  process.exit(1);
});
