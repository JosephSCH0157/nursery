import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type {
  FillerCleanupOptions,
  GapCleanupOptions,
  RetakeCleanupOptions,
} from "../../src/editor/hammerCleanupTools";

function cloneSegments(segments: HammerTranscriptSegment[]): HammerTranscriptSegment[] {
  return segments.map((segment) => ({ ...segment }));
}

const baseSegments: HammerTranscriptSegment[] = [
  {
    segment_id: "seg_1",
    start_sec: 0,
    end_sec: 1,
    speaker: "S1",
    text: "um we should start now",
  },
  {
    segment_id: "seg_2",
    start_sec: 1.05,
    end_sec: 2,
    speaker: "S1",
    text: "Florida oranges really sta—",
  },
  {
    segment_id: "seg_3",
    start_sec: 2.05,
    end_sec: 2.5,
    speaker: "S1",
    text: "let me start that again",
  },
  {
    segment_id: "seg_4",
    start_sec: 2.55,
    end_sec: 4.2,
    speaker: "S1",
    text: "Florida oranges didn't start small.",
  },
  {
    segment_id: "seg_5",
    start_sec: 4.8,
    end_sec: 6,
    speaker: "S1",
    text: "this is the final line.",
  },
];

const baseOptions = {
  retakes: {
    detection: "normal",
    preferLaterCleanerTake: true,
    honorExplicitRetakePhrases: true,
    sameSpeakerOnly: true,
  } satisfies RetakeCleanupOptions,
  fillers: {
    aggressiveness: "medium",
    protectIntentionalPhrasing: true,
  } satisfies FillerCleanupOptions,
  gaps: {
    maxGapSec: 0.4,
    minPauseSec: 0.1,
    preserveDramaticPauses: false,
  } satisfies GapCleanupOptions,
};

export function buildHammerCleanupGoldenFixture(): {
  segments: HammerTranscriptSegment[];
  options: {
    retakes: RetakeCleanupOptions;
    fillers: FillerCleanupOptions;
    gaps: GapCleanupOptions;
  };
} {
  return {
    segments: cloneSegments(baseSegments),
    options: {
      retakes: { ...baseOptions.retakes },
      fillers: { ...baseOptions.fillers },
      gaps: { ...baseOptions.gaps },
    },
  };
}

export const hammerCleanupGoldenExpectations = {
  quickClean: {
    summary: {
      changedSegments: 4,
      removedSegments: 2,
      timeSavedSec: 4.7,
    },
    resultSegments: [
      {
        segment_id: "seg_1",
        text: "we should start now",
        start_sec: 0,
        end_sec: 1,
      },
      {
        segment_id: "seg_4",
        text: "Florida oranges didn't start small.",
        start_sec: 1.2,
        end_sec: 2.9,
      },
      {
        segment_id: "seg_5",
        text: "this is the final line.",
        start_sec: 3,
        end_sec: 4.2,
      },
    ],
  },
  candidateQueue: {
    retakeCardCount: 1,
    suggestedRemovalText: [
      "Florida oranges really sta—\nlet me start that again",
    ],
    descriptions: [
      "Possible retake detected (restart marker + reread). Keep the cleaner delivery?",
    ],
  },
} as const;
