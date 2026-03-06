import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";

export const DEFAULT_TRANSCRIPT_FIXTURE_ID = "podcast_a";

const FIXTURE_INDEX: Record<string, HammerTranscriptSegment[]> = {
  podcast_a: [
    {
      segment_id: "seg_001",
      start_sec: 3,
      end_sec: 7,
      speaker: "S1",
      text: "Let me start with this.",
    },
    {
      segment_id: "seg_002",
      start_sec: 7,
      end_sec: 10,
      speaker: "S2",
      text: "Right, and that is exactly the tension.",
    },
    {
      segment_id: "seg_003",
      start_sec: 10,
      end_sec: 14,
      speaker: "S1",
      text: "Here is the real problem we keep seeing.",
    },
    {
      segment_id: "seg_004",
      start_sec: 14,
      end_sec: 17,
      speaker: "S2",
      text: "Most teams optimize output, not signal.",
    },
    {
      segment_id: "seg_005",
      start_sec: 17,
      end_sec: 21,
      speaker: "S1",
      text: "That is why workflow quality breaks first.",
    },
    {
      segment_id: "seg_006",
      start_sec: 21,
      end_sec: 24,
      speaker: "G1",
      text: "Can we anchor this to one repeatable pattern?",
    },
    {
      segment_id: "seg_007",
      start_sec: 24,
      end_sec: 28,
      speaker: "S1",
      text: "Yes, transcript-driven edits become deterministic.",
    },
    {
      segment_id: "seg_008",
      start_sec: 28,
      end_sec: 32,
      speaker: "S2",
      text: "Then shorts packaging is mostly review, not rescue.",
    },
  ],
  podcast_b: [
    {
      segment_id: "seg_b_001",
      start_sec: 2,
      end_sec: 6,
      speaker: "S1",
      text: "Welcome back to the show.",
    },
    {
      segment_id: "seg_b_002",
      start_sec: 6,
      end_sec: 11,
      speaker: "S2",
      text: "Today we are comparing quality and speed.",
    },
    {
      segment_id: "seg_b_003",
      start_sec: 11,
      end_sec: 15,
      speaker: "S1",
      text: "This system gives us deterministic editing signals.",
    },
    {
      segment_id: "seg_b_004",
      start_sec: 15,
      end_sec: 20,
      speaker: "G1",
      text: "That makes review loops dramatically shorter.",
    },
    {
      segment_id: "seg_b_005",
      start_sec: 20,
      end_sec: 26,
      speaker: "S2",
      text: "And every seek action is grounded in transcript segments.",
    },
  ],
};

function cloneSegments(segments: HammerTranscriptSegment[]): HammerTranscriptSegment[] {
  return segments.map((segment) => ({ ...segment }));
}

export function getDevTranscriptSegments(fixtureId: string): HammerTranscriptSegment[] {
  const normalized = fixtureId.trim();
  const fallback = FIXTURE_INDEX[DEFAULT_TRANSCRIPT_FIXTURE_ID] ?? [];
  const picked = FIXTURE_INDEX[normalized] ?? fallback;
  return cloneSegments(picked);
}
