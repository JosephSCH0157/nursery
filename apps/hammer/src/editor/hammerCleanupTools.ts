import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import { roundToTenth } from "./hammerWorkspaceTimeline";

export type GapCleanupOptions = {
  maxGapSec: number;
  minPauseSec: number;
  preserveDramaticPauses: boolean;
};

export type FillerCleanupOptions = {
  aggressiveness: "light" | "medium" | "strong";
  protectIntentionalPhrasing: boolean;
};

export type RetakeCleanupOptions = {
  detection: "conservative" | "normal" | "aggressive";
  preferLaterCleanerTake: boolean;
  honorExplicitRetakePhrases: boolean;
  sameSpeakerOnly: boolean;
};

export type CleanupSuggestionType = "gap_trim" | "filler_remove" | "retake_remove";

export type HammerCleanupSuggestion = {
  id: string;
  type: CleanupSuggestionType;
  segmentId: string;
  description: string;
  confidence: number;
  timeSavedSec: number;
};

export type HammerCleanupPreview = {
  label: string;
  resultSegments: HammerTranscriptSegment[];
  suggestions: HammerCleanupSuggestion[];
  summary: {
    changedSegments: number;
    removedSegments: number;
    timeSavedSec: number;
  };
};

function cloneSegments(segments: HammerTranscriptSegment[]): HammerTranscriptSegment[] {
  return segments.map((segment) => ({ ...segment }));
}

function tokens(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s']/g, " ").split(/\s+/).filter(Boolean);
}

export function previewShortenGaps(
  segments: HammerTranscriptSegment[],
  options: GapCleanupOptions,
): HammerCleanupPreview {
  const next = cloneSegments(segments).sort((a, b) => a.start_sec - b.start_sec);
  const suggestions: HammerCleanupSuggestion[] = [];
  const changed = new Set<string>();

  for (let index = 1; index < next.length; index += 1) {
    const previous = next[index - 1];
    const current = next[index];
    const gap = roundToTenth(current.start_sec - previous.end_sec);
    if (gap <= options.maxGapSec) continue;
    if (options.preserveDramaticPauses && gap >= Math.max(1.1, options.maxGapSec * 2)) continue;

    const targetGap = Math.max(0.1, Math.min(options.maxGapSec, options.minPauseSec));
    const shiftSec = roundToTenth(gap - targetGap);
    if (shiftSec <= 0) continue;

    const duration = Math.max(0.1, roundToTenth(current.end_sec - current.start_sec));
    const nextStart = roundToTenth(Math.max(previous.end_sec + targetGap, current.start_sec - shiftSec));
    const nextEnd = roundToTenth(nextStart + duration);
    current.start_sec = nextStart;
    current.end_sec = nextEnd;
    changed.add(current.segment_id);

    suggestions.push({
      id: `gap:${current.segment_id}:${index}`,
      type: "gap_trim",
      segmentId: current.segment_id,
      description: `Tighten gap before this line by ${shiftSec.toFixed(1)}s.`,
      confidence: 0.97,
      timeSavedSec: shiftSec,
    });
  }

  return {
    label: "Shorten Gaps",
    resultSegments: next,
    suggestions,
    summary: {
      changedSegments: changed.size,
      removedSegments: 0,
      timeSavedSec: roundToTenth(suggestions.reduce((sum, item) => sum + item.timeSavedSec, 0)),
    },
  };
}

const FILLERS_LIGHT = ["um", "uh", "er", "ah"];
const FILLERS_MEDIUM = [...FILLERS_LIGHT, "you know", "i mean", "sort of", "kind of"];
const FILLERS_STRONG = [...FILLERS_MEDIUM, "like", "basically", "literally"];

function buildFillerDictionary(level: FillerCleanupOptions["aggressiveness"]): string[] {
  if (level === "strong") return FILLERS_STRONG;
  if (level === "medium") return FILLERS_MEDIUM;
  return FILLERS_LIGHT;
}

function cleanFillerText(text: string, dictionary: string[]): { text: string; removed: number } {
  let next = text;
  let removed = 0;
  for (const phrase of dictionary) {
    const pattern = new RegExp(`\\b${phrase.replace(/\s+/g, "\\s+")}\\b`, "gi");
    next = next.replace(pattern, () => {
      removed += 1;
      return "";
    });
  }
  next = next.replace(/\s{2,}/g, " ").replace(/\s+([,.;!?])/g, "$1").trim();
  return { text: next, removed };
}

export function previewRemoveFillers(
  segments: HammerTranscriptSegment[],
  options: FillerCleanupOptions,
): HammerCleanupPreview {
  const next = cloneSegments(segments);
  const dictionary = buildFillerDictionary(options.aggressiveness);
  const suggestions: HammerCleanupSuggestion[] = [];
  const changed = new Set<string>();

  for (const segment of next) {
    const before = segment.text;
    const cleaned = cleanFillerText(before, dictionary);
    if (cleaned.removed <= 0) continue;
    if (options.protectIntentionalPhrasing && /^like\s/i.test(before) && options.aggressiveness !== "strong") continue;
    segment.text = cleaned.text.length ? cleaned.text : before;
    changed.add(segment.segment_id);
    suggestions.push({
      id: `filler:${segment.segment_id}`,
      type: "filler_remove",
      segmentId: segment.segment_id,
      description: `Remove ${cleaned.removed} filler phrase${cleaned.removed === 1 ? "" : "s"}.`,
      confidence: options.aggressiveness === "strong" ? 0.72 : options.aggressiveness === "medium" ? 0.82 : 0.91,
      timeSavedSec: roundToTenth(Math.min(0.12 * cleaned.removed, Math.max(0.1, segment.end_sec - segment.start_sec))),
    });
  }

  return {
    label: "Remove Fillers",
    resultSegments: next,
    suggestions,
    summary: {
      changedSegments: changed.size,
      removedSegments: 0,
      timeSavedSec: roundToTenth(suggestions.reduce((sum, item) => sum + item.timeSavedSec, 0)),
    },
  };
}

const RETAKE_PHRASES = /\b(redo|retake|take that again|scratch that|let me do that again|let me redo that)\b/i;

function overlapScore(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const left = a.slice(0, 5);
  const right = b.slice(0, 5);
  let overlap = 0;
  for (const token of left) {
    if (right.includes(token)) overlap += 1;
  }
  return overlap / Math.max(left.length, right.length);
}

export function previewRemoveRetakes(
  segments: HammerTranscriptSegment[],
  options: RetakeCleanupOptions,
): HammerCleanupPreview {
  const sorted = cloneSegments(segments).sort((a, b) => a.start_sec - b.start_sec);
  const suggestions: HammerCleanupSuggestion[] = [];
  const removeIds = new Set<string>();

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index];
    const next = sorted[index + 1];
    if (options.sameSpeakerOnly && current.speaker !== next.speaker) continue;

    const explicit = options.honorExplicitRetakePhrases && RETAKE_PHRASES.test(current.text);
    const score = overlapScore(tokens(current.text), tokens(next.text));
    const threshold = options.detection === "aggressive" ? 0.4 : options.detection === "normal" ? 0.55 : 0.7;
    const nearDuplicate = score >= threshold;
    if (!explicit && !nearDuplicate) continue;

    const removeTarget = options.preferLaterCleanerTake ? current : next;
    if (removeIds.has(removeTarget.segment_id)) continue;
    removeIds.add(removeTarget.segment_id);
    suggestions.push({
      id: `retake:${removeTarget.segment_id}:${index}`,
      type: "retake_remove",
      segmentId: removeTarget.segment_id,
      description: explicit
        ? "Remove explicit retake phrase segment."
        : "Remove likely repeated take in adjacent same-speaker pair.",
      confidence: explicit ? 0.95 : Math.max(0.55, Math.min(0.93, score)),
      timeSavedSec: roundToTenth(Math.max(0.1, removeTarget.end_sec - removeTarget.start_sec)),
    });
  }

  const result = sorted.filter((segment) => !removeIds.has(segment.segment_id));
  return {
    label: "Remove Retakes",
    resultSegments: result,
    suggestions,
    summary: {
      changedSegments: suggestions.length,
      removedSegments: suggestions.length,
      timeSavedSec: roundToTenth(suggestions.reduce((sum, item) => sum + item.timeSavedSec, 0)),
    },
  };
}

export function previewQuickClean(args: {
  segments: HammerTranscriptSegment[];
  gaps: GapCleanupOptions;
  fillers: FillerCleanupOptions;
  retakes: RetakeCleanupOptions;
}): HammerCleanupPreview {
  const retakes = previewRemoveRetakes(args.segments, args.retakes);
  const fillers = previewRemoveFillers(retakes.resultSegments, args.fillers);
  const gaps = previewShortenGaps(fillers.resultSegments, args.gaps);
  const suggestions = [...retakes.suggestions, ...fillers.suggestions, ...gaps.suggestions];

  return {
    label: "Quick Clean",
    resultSegments: gaps.resultSegments,
    suggestions,
    summary: {
      changedSegments: new Set(suggestions.map((item) => item.segmentId)).size,
      removedSegments: retakes.summary.removedSegments,
      timeSavedSec: roundToTenth(suggestions.reduce((sum, item) => sum + item.timeSavedSec, 0)),
    },
  };
}
