
import assert from "node:assert/strict";
import type { HammerTranscriptSegment } from "../../../packages/contracts/hammer/transcript.contract";
import {
  previewSpeakerInterview,
  previewSpeakerPanel,
  previewQuickClean,
  previewRemoveFillers,
  previewRemoveRetakes,
  previewShortenGaps,
  previewSpeakerSolo,
  previewTightenSelection,
} from "../src/editor/hammerCleanupTools";
import type { HammerDeadAirAnalysis } from "../src/editor/hammerDeadAirClosure";
import { deriveAudioCutsForDeadAirClosure, deriveAudioCutsForRemovedSegments } from "../src/editor/hammerCleanupExecution";

function s(id: string, start: number, end: number, speaker: string, text: string): HammerTranscriptSegment {
  return { segment_id: id, start_sec: start, end_sec: end, speaker, text };
}

function buildRetakeProductionFixtures() {
  return {
    markerOnly: [
      s("prod_marker_a", 0, 0.8, "Host", "Let me start that again."),
      s(
        "prod_marker_b",
        0.85,
        3.2,
        "Host",
        "Florida oranges didn't start small. Commercial production took off fast.",
      ),
    ],
    abortMarkerRedo: [
      s("prod_chain_a", 0, 2.2, "Host", "At first, the board had stated that it would not attempt to avoid responsi—"),
      s("prod_chain_b", 2.25, 2.9, "Host", "let me start that again"),
      s(
        "prod_chain_c",
        2.95,
        6.6,
        "Host",
        "At first, the board had stated that it would not attempt to avoid responsibility.",
      ),
    ],
    backwardExplicitCue: [
      s(
        "prod_back_a",
        0,
        2.6,
        "Host",
        "In the years that followed, changes started to be made.",
      ),
      s(
        "prod_back_b",
        2.65,
        6.0,
        "Host",
        "Let me start that again. In the years that followed, changes started to be made.",
      ),
    ],
    shortLeadIn: [
      s("prod_leadin_a", 0, 0.7, "Host", "Today, Aberfan..."),
      s(
        "prod_leadin_b",
        0.75,
        3.8,
        "Host",
        "Today, Aberfan is quiet. Pantglas Junior School is gone.",
      ),
    ],
    cueTrimOnly: [
      s(
        "prod_trim_a",
        0,
        3.3,
        "Host",
        "Let me start that again. Not little shelters with a cash box.",
      ),
      s("prod_trim_b", 3.35, 5.0, "Host", "Florida oranges didn't start small."),
    ],
  } as const;
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

// ... (rest unchanged but includes production tests)
