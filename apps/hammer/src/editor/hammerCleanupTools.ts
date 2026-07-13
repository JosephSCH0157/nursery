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

export type SpeakerSoloOptions = {
  targetSpeaker: string;
  collapseInterruptions: boolean;
  compressGaps: boolean;
  maxInterruptionSec: number;
};

export type SpeakerInterviewOptions = {
  hostSpeaker: string;
  respondentSpeaker: string;
  tightness: "light" | "medium" | "tight";
  removeBackchannels: boolean;
  collapseInterruptions: boolean;
  maxInterruptionSec: number;
};

export type SpeakerMonologueOptions = {
  targetSpeaker: string;
  removeBackchannels: boolean;
  suppressInterruptions: boolean;
  maxInterruptionSec: number;
  tightenTargetRuns: boolean;
  compressGaps: boolean;
};

export type SpeakerPanelOptions = {
  hostSpeaker: string;
  primarySpeakerBias: "none" | "balanced" | "host_favoring";
  removeShortBackchannels: boolean;
  suppressShortCrossTalk: boolean;
  maxInterruptionSec: number;
};

export type CleanupSuggestionType =
  | "gap_trim"
  | "filler_remove"
  | "retake_remove"
  | "repetition_collapse"
  | "restart_trim"
  | "fragment_merge";

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
  metadata?: {
      tightenSelection?: {
        intent: string;
        beforeText: string;
        afterText: string;
        removedFillers: number;
      collapsedRepetitions: number;
      mergedFragments: number;
      confidenceLabel: "High" | "Medium" | "Low";
        confidenceScore: number;
        safetyNote: string;
      };
      speakerSolo?: {
        intent: string;
        targetSpeaker: string;
        scopeLabel: string;
        suppressedSegments: number;
        collapsedInterruptions: number;
        estimatedDurationSavedSec: number;
        confidenceLabel: "High" | "Medium" | "Low";
        confidenceScore: number;
        safetyNote: string;
      };
      speakerInterview?: {
        intent: string;
        hostSpeaker: string;
        respondentSpeaker: string;
        promptsKept: number;
        answerSegmentsTightened: number;
        fillersRemoved: number;
        retakesRemoved: number;
        interruptionsSuppressed: number;
        estimatedDurationSavedSec: number;
        confidenceLabel: "High" | "Medium" | "Low";
        confidenceScore: number;
        safetyNote: string;
      };
      speakerMonologue?: {
        intent: string;
        targetSpeaker: string;
        backchannelsRemoved: number;
        interruptionsSuppressed: number;
        sameSpeakerRunsTightened: number;
        estimatedDurationSavedSec: number;
        confidenceLabel: "High" | "Medium" | "Low";
        confidenceScore: number;
        safetyNote: string;
      };
      speakerPanel?: {
        intent: string;
        participantScope: string;
        hostSpeaker: string;
        primarySpeakerBias: "none" | "balanced" | "host_favoring";
        backchannelsRemoved: number;
        crossTalkSegmentsSuppressed: number;
        turnsPreserved: number;
        estimatedDurationSavedSec: number;
        confidenceLabel: "High" | "Medium" | "Low";
        confidenceScore: number;
        safetyNote: string;
      };
    };
};

function cloneSegments(segments: readonly HammerTranscriptSegment[]): HammerTranscriptSegment[] {
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

function escapeFillerPhraseForRegex(phrase: string): string {
  return phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
}

function buildFillerPatterns(phrase: string): RegExp[] {
  const escaped = escapeFillerPhraseForRegex(phrase);
  return [
    new RegExp(`^\\s*${escaped}\\b[\\s,;:.-]*`, "i"),
    new RegExp(`([,;:-]\\s*)${escaped}\\b(?=(\\s*[,;:-]|\\s|$))`, "i"),
    new RegExp(`\\b${escaped}\\b(?=\\s*[,;:-])`, "i"),
    new RegExp(`\\b${escaped}\\b`, "i"),
  ];
}

function cleanFillerWhitespace(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/(^|[\s([{])[,;:-]+(?=\s|$)/g, "$1")
    .replace(/([,;:-])\s*([,;:-])+/g, "$1")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();
}

function cleanFillerText(text: string, dictionary: string[]): { text: string; removed: number } {
  let next = text;
  let removed = 0;
  for (const phrase of dictionary) {
    let mutated = true;
    while (mutated) {
      mutated = false;
      for (const pattern of buildFillerPatterns(phrase)) {
        const match = pattern.exec(next);
        if (!match || match.index == null) continue;
        const fullMatch = match[0];
        const start = match.index;
        const end = start + fullMatch.length;
        const leadingPunctuation = typeof match[1] === "string" ? match[1] : null;
        next = `${next.slice(0, start)}${leadingPunctuation ?? " "}${next.slice(end)}`;
        removed += 1;
        mutated = true;
        break;
      }
    }
  }
  next = cleanFillerWhitespace(next);
  return { text: next, removed };
}

function normalizeTextSpacing(text: string): string {
  return text
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();
}

function collapseRepeatedSingleWords(text: string): { text: string; collapsed: number } {
  let collapsed = 0;
  const next = text.replace(/\b([a-z']+)(?:\s+\1\b)+/gi, (_match, word: string) => {
    collapsed += 1;
    return word;
  });
  return { text: next, collapsed };
}

function collapseRepeatedShortPhrases(text: string): { text: string; collapsed: number } {
  let collapsed = 0;
  const next = text.replace(
    /\b([a-z']+(?:\s+[a-z']+){1,3})(?:\s*,?\s+\1\b)+/gi,
    (_match, phrase: string) => {
      collapsed += 1;
      return phrase;
    },
  );
  return { text: next, collapsed };
}

function trimRestartPrefix(text: string): { text: string; trimmed: boolean } {
  const next = text.replace(
    /^(?:\s*(?:um+|uh+|er+|ah+|i mean|you know|so|well|okay|ok|let me start over|sorry)\s*[,.-]*)+/i,
    "",
  );
  return {
    text: normalizeTextSpacing(next),
    trimmed: normalizeTextSpacing(next) !== normalizeTextSpacing(text),
  };
}

function trimWanderingTail(text: string): { text: string; trimmed: boolean } {
  const next = text.replace(
    /\s*(?:you know|or whatever|and stuff|kind of thing|if that makes sense)\s*[.!?]*$/i,
    "",
  );
  return {
    text: normalizeTextSpacing(next),
    trimmed: normalizeTextSpacing(next) !== normalizeTextSpacing(text),
  };
}

function tokenCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function isLikelyFragment(text: string): boolean {
  const trimmed = normalizeTextSpacing(text);
  if (!trimmed) return true;
  const words = tokenCount(trimmed);
  if (words <= 2) return true;
  if (/^(?:i mean|you know|so|well|okay|ok)\b/i.test(trimmed) && words <= 5) return true;
  if (!/[.!?]$/.test(trimmed) && words <= 3) return true;
  return false;
}

export function previewRemoveFillers(
  segments: HammerTranscriptSegment[],
  options: FillerCleanupOptions,
): HammerCleanupPreview {
  const next = cloneSegments(segments);
  const dictionary = buildFillerDictionary(options.aggressiveness);
  const suggestions: HammerCleanupSuggestion[] = [];
  const changed = new Set<string>();
  const removed = new Set<string>();

  for (const segment of next) {
    const before = segment.text;
    const cleaned = cleanFillerText(before, dictionary);
    if (cleaned.removed <= 0) continue;
    if (options.protectIntentionalPhrasing && /^like\s/i.test(before) && options.aggressiveness !== "strong") continue;
    const normalizedBefore = normalizeTextSpacing(before);
    const normalizedAfter = normalizeTextSpacing(cleaned.text);
    // Conservative pass: only emit a candidate when the proposed text is meaningfully different.
    // If the cleaned segment becomes empty, remove the segment entirely (filler-only).
    if (!normalizedAfter || tokens(normalizedAfter).length === 0) {
      removed.add(segment.segment_id);
      suggestions.push({
        id: `filler:${segment.segment_id}`,
        type: "filler_remove",
        segmentId: segment.segment_id,
        description: `Remove filler-only segment (${cleaned.removed} filler phrase${cleaned.removed === 1 ? "" : "s"}).`,
        confidence: options.aggressiveness === "strong" ? 0.7 : options.aggressiveness === "medium" ? 0.78 : 0.86,
        timeSavedSec: roundToTenth(Math.max(0.1, segment.end_sec - segment.start_sec)),
      });
      continue;
    }
    if (normalizedAfter === normalizedBefore) continue;
    segment.text = normalizedAfter;
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
    resultSegments: next.filter((segment) => !removed.has(segment.segment_id)),
    suggestions,
    summary: {
      changedSegments: changed.size,
      removedSegments: removed.size,
      timeSavedSec: roundToTenth(suggestions.reduce((sum, item) => sum + item.timeSavedSec, 0)),
    },
  };
}

// Explicit retake cues should be treated as "speaker intent", not "ASR intent".
// Keep this list relatively specific; broad cues like plain "sorry" are handled as weaker signals.
const RETAKE_PHRASES_STRONG =
  /\b(?:redo|retake|take that again|take again|take two|take 2|one more time|scratch that|start over|from the top|let me start that again|let me start again|let me start over|let me do that again|let me try that again|let me redo that|let me rephrase that)\b/i;
const RETAKE_PHRASES_WEAK = /\b(?:sorry|nope|no|wait|hold on|hang on)\b/i;
type RetakeCategory =
  | "trigger_only"
  | "trigger_phrase_restart"
  | "no_trigger_restart"
  | "long_abandoned_restart";

function splitOnStrongRetakeCue(text: string): { before: string; cue: string; after: string } | null {
  const normalized = normalizeTextSpacing(String(text || ""));
  if (!normalized) return null;
  const match = RETAKE_PHRASES_STRONG.exec(normalized);
  if (!match) return null;
  const cue = normalizeTextSpacing(match[0] ?? "");
  const start = Math.max(0, match.index ?? 0);
  const end = Math.min(normalized.length, start + String(match[0] ?? "").length);
  const before = normalizeTextSpacing(normalized.slice(0, start).replace(/[,\s.\-–—]+$/g, ""));
  const after = normalizeTextSpacing(normalized.slice(end).replace(/^[,\s.\-–—]+/g, ""));
  if (!cue) return null;
  return { before, cue, after };
}

type RestartEvidence = {
  score: number;
  openingMatch: boolean;
  intentMatch: boolean;
  subjectRepeat: boolean;
  abortedLeadIn: boolean;
  shortLeadInReread: boolean;
  prefixRaw: number;
  overlap: number;
  jaccard: number;
};

function evaluateRestartEvidence(beforeText: string, afterText: string): RestartEvidence {
  const rawBefore = tokens(beforeText);
  const rawAfter = tokens(afterText);
  const beforeContent = contentTokens(beforeText);
  const afterContent = contentTokens(afterText);
  const prefixRaw = commonPrefixLength(rawBefore, rawAfter, 10);
  const similarity = tokenOverlapScore(beforeContent, afterContent);
  const openingMatch = prefixRaw >= 2;
  const intentMatch = similarity.overlap >= 0.72 && similarity.jaccard >= 0.4;
  const subjectRepeat = Boolean(
    beforeContent[0]
    && afterContent[0]
    && beforeContent[0] === afterContent[0],
  );
  const abortedLeadIn = isLikelyAborted(beforeText) || hasLocalRepairMarker(beforeText);
  const shortLeadInReread = isShortAbortedLeadInReread(beforeText, afterText);
  const score = Number(Math.min(0.99, (
    (openingMatch ? 0.34 : 0)
    + (intentMatch ? 0.22 : 0)
    + (subjectRepeat ? 0.16 : 0)
    + (abortedLeadIn ? 0.16 : 0)
    + (shortLeadInReread ? 0.12 : 0)
  )).toFixed(2));
  return {
    score,
    openingMatch,
    intentMatch,
    subjectRepeat,
    abortedLeadIn,
    shortLeadInReread,
    prefixRaw,
    overlap: similarity.overlap,
    jaccard: similarity.jaccard,
  };
}

function stripRetakeCuePrefix(text: string): string {
  const normalized = normalizeTextSpacing(String(text || ""));
  if (!normalized) return "";
  const stripped = normalized
    // Strip common "take again" lead-ins.
    .replace(
      /^(?:(?:um+|uh+|er+|ah+)\s*)?(?:(?:okay|ok|well)\s*)?(?:(?:sorry|nope|no|wait|hold on|hang on)\s*[,.-]*)*(?:let me\s+(?:start(?:\s+that)?\s+again|start\s+over|try\s+that\s+again|do\s+that\s+again|redo\s+that|rephrase\s+that)|scratch\s+that|take\s+(?:that\s+)?again|take\s+(?:two|2)|one\s+more\s+time|from\s+the\s+top|start\s+over)\s*[,.-]*\s*/i,
      "",
    )
    .trim();
  return stripped || normalized;
}

function isRetakeMarkerOnly(text: string): boolean {
  const trimmed = normalizeTextSpacing(String(text || ""));
  if (!trimmed) return false;
  // Segments that are *only* a restart marker (no substantive content) should be removable even without overlap evidence.
  return /^(?:(?:um+|uh+|er+|ah+)\s*)?(?:(?:okay|ok|well)\s*)?(?:(?:sorry|nope|no|wait|hold on|hang on)\s*[,.-]*)*(?:let me\s+(?:start(?:\s+that)?\s+again|start\s+over|try\s+that\s+again|do\s+that\s+again|redo\s+that|rephrase\s+that)|scratch\s+that|take\s+(?:that\s+)?again|take\s+(?:two|2)|one\s+more\s+time|from\s+the\s+top|start\s+over)\s*[,.-]*$/i
    .test(trimmed);
}

function contentTokens(text: string): string[] {
  const stop = new Set([
    "um",
    "uh",
    "er",
    "ah",
    "like",
    "basically",
    "literally",
    "you",
    "know",
    "i",
    "mean",
    "okay",
    "ok",
    "well",
    "so",
  ]);
  return tokens(text).filter((token) => !stop.has(token));
}

function tokenOverlapScore(a: string[], b: string[]): { overlap: number; jaccard: number } {
  if (a.length === 0 || b.length === 0) return { overlap: 0, jaccard: 0 };
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return {
    overlap: intersection / Math.max(1, Math.min(setA.size, setB.size)),
    jaccard: intersection / Math.max(1, union),
  };
}

function hasLocalRepairMarker(text: string): boolean {
  const normalized = normalizeTextSpacing(String(text || ""));
  if (!normalized) return false;
  // "the the", "it was it was", etc.
  if (/\b([a-z']+)\s+\1\b/i.test(normalized)) return true;
  // Mid-utterance overwrite markers often show up as em-dash or ellipsis.
  if (/[—…]/.test(normalized)) return true;
  // Simple stutter forms: "re- really"
  if (/\b[a-z']+-\s+[a-z']/i.test(normalized)) return true;
  return false;
}

function scoreTakeQuality(text: string): number {
  // Retake cue phrases inside a segment are usually "meta" speech. Score the substantive portion.
  const normalized = stripRetakeCuePrefix(String(text || ""));
  if (!normalized) return -10;
  let score = 0;
  if (/[.!?]$/.test(normalized)) score += 1;
  if (isLikelyAborted(normalized)) score -= 1;
  if (isRetakeMarkerOnly(normalized)) score -= 1.5;
  if (hasLocalRepairMarker(normalized)) score -= 0.5;
  const words = tokenCount(normalized);
  score += Math.min(1.2, words / 18);
  return score;
}

function endsWithAbortMark(text: string): boolean {
  const trimmed = String(text || "").trim();
  if (!trimmed) return false;
  return /[—-…]$/.test(trimmed) || /\.\.\.$/.test(trimmed);
}

function endsWithWeakContinuation(text: string): boolean {
  const trimmed = normalizeTextSpacing(String(text || ""));
  if (!trimmed) return false;
  if (/[.!?]$/.test(trimmed)) return false;
  return /\b(?:and|but|or|so|because|which|that|to|with|for|of|in|on|at|as)\s*$/i.test(trimmed);
}

function isLikelyAborted(text: string): boolean {
  const trimmed = String(text || "").trim();
  if (!trimmed) return true;
  if (endsWithAbortMark(trimmed)) return true;
  if (endsWithWeakContinuation(trimmed)) return true;
  // Short non-terminal fragments are likely false starts.
  const normalized = normalizeTextSpacing(trimmed);
  const words = tokenCount(normalized);
  if (!/[.!?]$/.test(normalized) && words > 0 && words <= 6) return true;
  return false;
}

function commonPrefixLength(a: string[], b: string[], limit = 12): number {
  const max = Math.min(a.length, b.length, Math.max(0, Math.trunc(limit)));
  let count = 0;
  for (let idx = 0; idx < max; idx += 1) {
    if (a[idx] !== b[idx]) break;
    count += 1;
  }
  return count;
}

function isShortAbortedLeadInReread(currentText: string, nextText: string): boolean {
  if (!isLikelyAborted(currentText)) return false;
  const currentRawTokens = tokens(currentText);
  const nextRawTokens = tokens(nextText);
  if (currentRawTokens.length === 0) return false;
  if (currentRawTokens.length > 6) return false;
  if (nextRawTokens.length < currentRawTokens.length + 3) return false;
  const rawPrefix = commonPrefixLength(currentRawTokens, nextRawTokens, 8);
  return rawPrefix >= Math.min(2, currentRawTokens.length);
}

export function previewRemoveRetakes(
  segments: readonly HammerTranscriptSegment[],
  options: RetakeCleanupOptions,
): HammerCleanupPreview {
  const sorted = cloneSegments(segments).sort((a, b) => a.start_sec - b.start_sec);
  const suggestions: HammerCleanupSuggestion[] = [];
  const removeIds = new Set<string>();
  const restartTrimUpdates = new Map<string, { text: string; confidence: number; description: string; index: number }>();

  const maxGapSec = options.detection === "aggressive" ? 1.8 : options.detection === "normal" ? 1.2 : 0.8;
  const includeProbable = options.detection !== "conservative";
  const includeRisky = options.detection === "aggressive";

  function speakersCompatible(...segmentsToCompare: HammerTranscriptSegment[]): boolean {
    if (!options.sameSpeakerOnly) return true;
    const speaker = segmentsToCompare[0]?.speaker;
    return segmentsToCompare.every((seg) => seg.speaker === speaker);
  }

  function shouldRemoveEarlierKeepLater(args: { earlier: HammerTranscriptSegment; later: HammerTranscriptSegment }): boolean {
    if (options.preferLaterCleanerTake) {
      const earlierScore = scoreTakeQuality(args.earlier.text);
      const laterScore = scoreTakeQuality(args.later.text);
      // Prefer later unless it is clearly worse.
      return !(earlierScore >= laterScore + 1.0);
    }
    return scoreTakeQuality(args.earlier.text) <= scoreTakeQuality(args.later.text);
  }

  function pushRetakeSuggestion(args: {
    removeSegmentIds: string[];
    keepSegmentId: string;
    description: string;
    confidence: number;
    index: number;
    category: RetakeCategory;
  }): void {
    const uniqueRemove = Array.from(new Set(args.removeSegmentIds)).filter(Boolean);
    if (uniqueRemove.length === 0) return;
    if (uniqueRemove.some((id) => removeIds.has(id))) return;
    if (removeIds.has(args.keepSegmentId)) return;

    for (const id of uniqueRemove) removeIds.add(id);
    const timeSavedSec = roundToTenth(
      uniqueRemove
        .map((id) => sorted.find((segment) => segment.segment_id === id))
        .filter((segment): segment is HammerTranscriptSegment => Boolean(segment))
        .reduce((sum, segment) => sum + Math.max(0.1, segment.end_sec - segment.start_sec), 0),
    );
    suggestions.push({
      id: uniqueRemove.length === 1
        ? `retake_pair:${uniqueRemove[0]}:${args.keepSegmentId}:${args.category}:${args.index}`
        : `retake_chain:${uniqueRemove.join(",")}:${args.keepSegmentId}:${args.category}:${args.index}`,
      type: "retake_remove",
      segmentId: uniqueRemove[0]!,
      description: args.description,
      confidence: args.confidence,
      timeSavedSec,
    });
  }

  function pushRestartTrimSuggestion(args: {
    segment: HammerTranscriptSegment;
    trimmedText: string;
    description: string;
    confidence: number;
    index: number;
  }): void {
    const before = normalizeTextSpacing(args.segment.text);
    const after = normalizeTextSpacing(args.trimmedText);
    if (!before || !after) return;
    if (before === after) return;
    if (removeIds.has(args.segment.segment_id)) return;
    const existing = restartTrimUpdates.get(args.segment.segment_id);
    const shouldReplace = !existing || args.confidence > (existing.confidence + 0.001);
    if (shouldReplace) {
      restartTrimUpdates.set(args.segment.segment_id, {
        text: after,
        description: args.description,
        confidence: args.confidence,
        index: args.index,
      });
    } else {
      return;
    }
    suggestions.push({
      id: `retake:restart_trim:${args.segment.segment_id}:${args.index}`,
      type: "restart_trim",
      segmentId: args.segment.segment_id,
      description: args.description,
      confidence: args.confidence,
      timeSavedSec: 0,
    });
  }

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index];
    const next = sorted[index + 1];
    if (removeIds.has(current.segment_id) || removeIds.has(next.segment_id)) continue;
    const pairSpeakersCompatible = speakersCompatible(current, next);

    const gapSec = Math.max(0, next.start_sec - current.end_sec);
    if (gapSec > maxGapSec) continue;

    // --- 3-segment chain: aborted take -> explicit marker -> clean take ---
    const third = sorted[index + 2] ?? null;
    if (third && !removeIds.has(third.segment_id)) {
      const gapToMarker = Math.max(0, next.start_sec - current.end_sec);
      const gapToRedo = Math.max(0, third.start_sec - next.end_sec);
      const chainSpeakersCompatible = speakersCompatible(current, next, third);
      const nextIsMarkerOnly = isRetakeMarkerOnly(next.text);
      if (gapToMarker <= maxGapSec && gapToRedo <= maxGapSec && nextIsMarkerOnly && (chainSpeakersCompatible || nextIsMarkerOnly)) {
        const aTokens = contentTokens(current.text);
        const cTokens = contentTokens(third.text);
        const prefix = commonPrefixLength(aTokens, cTokens, 14);
        const similarity = tokenOverlapScore(aTokens, cTokens);
        const resemblesRedo = (
          (prefix >= 3 && prefix >= Math.ceil(Math.min(10, aTokens.length) * 0.55))
          // Very short aborted false-starts often only share 2 tokens before diverging.
          || (isLikelyAborted(current.text) && aTokens.length <= 4 && prefix >= 2)
          || (similarity.overlap >= 0.86 && similarity.jaccard >= 0.65 && Math.min(aTokens.length, cTokens.length) >= 5)
        );
        if (resemblesRedo && (isLikelyAborted(current.text) || hasLocalRepairMarker(current.text) || includeProbable)) {
          pushRetakeSuggestion({
            removeSegmentIds: [current.segment_id, next.segment_id],
            keepSegmentId: third.segment_id,
            description: "Possible retake detected (restart marker + reread). Keep the cleaner delivery?",
            confidence: 0.93,
            index,
            category: "trigger_phrase_restart",
          });
          continue;
        }
      }
    }

    const currentTextRaw = String(current.text || "");
    const nextTextRaw = String(next.text || "");
    const markerOnly = options.honorExplicitRetakePhrases && isRetakeMarkerOnly(currentTextRaw);
    const explicitStrong = options.honorExplicitRetakePhrases && RETAKE_PHRASES_STRONG.test(currentTextRaw);
    const nextExplicitStrong = options.honorExplicitRetakePhrases && RETAKE_PHRASES_STRONG.test(nextTextRaw);
    const explicitWeak = options.honorExplicitRetakePhrases && RETAKE_PHRASES_WEAK.test(currentTextRaw);
    const currentText = stripRetakeCuePrefix(currentTextRaw);
    const nextText = stripRetakeCuePrefix(nextTextRaw);
    const aborted = isLikelyAborted(currentText);
    const repaired = hasLocalRepairMarker(currentText);
    const shortLeadInReread = isShortAbortedLeadInReread(currentText, nextText);

    // If speakers differ, only marker-only segments are safe to drop.
    if (!pairSpeakersCompatible && !markerOnly) continue;

    // Marker-only segments should be removable without requiring overlap evidence.
    if (markerOnly) {
      pushRetakeSuggestion({
        removeSegmentIds: [current.segment_id],
        keepSegmentId: next.segment_id,
        description: "Possible retake detected (trigger-only retake). Remove restart marker and keep the following take?",
        confidence: explicitStrong ? 0.96 : 0.86,
        index,
        category: "trigger_only",
      });
      continue;
    }

    const aTokens = contentTokens(currentText);
    const bTokens = contentTokens(nextText);
    const prefix = commonPrefixLength(aTokens, bTokens, 14);
    const similarity = tokenOverlapScore(aTokens, bTokens);
    const prefixStrong = (
      (prefix >= 3 && prefix >= Math.ceil(Math.min(8, aTokens.length) * 0.6))
      // Very short aborted false-starts often only share 2 tokens before diverging (e.g. "Florida's citrus—" restart).
      || (aborted && aTokens.length <= 4 && prefix >= 2)
    );
    const probableDuplicate = (
      similarity.overlap >= 0.86
      && similarity.jaccard >= 0.65
      && Math.min(aTokens.length, bTokens.length) >= 5
    );
    const riskyDuplicate = (
      similarity.overlap >= 0.75
      && similarity.jaccard >= 0.5
      && Math.min(aTokens.length, bTokens.length) >= 5
    );
    const rereadStrong = prefixStrong || probableDuplicate || shortLeadInReread;
    const rereadRisky = includeRisky && (rereadStrong || riskyDuplicate);
    const explicitWithEvidence = (explicitStrong || nextExplicitStrong) && (rereadStrong || aborted || repaired);

    // Conservative pass: only treat as retake when explicit or aborted.
    if (options.detection === "conservative") {
      if (!explicitWithEvidence && !aborted) continue;
      if (!prefixStrong && !shortLeadInReread) continue;
    } else {
      // Normal mode: certain + probable only. Aggressive mode: allow risky similarity tier as well.
      const passesCertain = explicitWithEvidence || markerOnly;
      const passesProbable = includeProbable && (rereadStrong && (aborted || repaired || probableDuplicate));
      const passesRisky = includeRisky && !passesCertain && !passesProbable && rereadRisky;

      if (!passesCertain && !passesProbable && !passesRisky) continue;

      // Even in aggressive mode, prevent accidental "emphasis repeats" across longer gaps.
      if (!passesCertain && gapSec > 0.9) continue;
    }

    const removeEarlier = shouldRemoveEarlierKeepLater({ earlier: current, later: next });
    const removeTarget = removeEarlier ? current : next;
    const keepTarget = removeEarlier ? next : current;
    if (removeTarget.segment_id === keepTarget.segment_id) continue;

    pushRetakeSuggestion({
      removeSegmentIds: [removeTarget.segment_id],
      keepSegmentId: keepTarget.segment_id,
      description: explicitStrong || nextExplicitStrong
        ? "Possible retake detected from an explicit restart cue (trigger + phrase restart). Keep the cleaner restarted delivery?"
        : aborted
        ? "Possible retake detected (no-trigger restart). Earlier delivery appears aborted or restarted."
        : repaired
        ? "Possible retake detected (no-trigger restart). Earlier delivery contains spoken repair markers."
        : includeRisky && explicitWeak
        ? "Possible retake detected (no-trigger restart, weak cue). Keep the cleaner delivery?"
        : "Possible retake detected (no-trigger restart). Near-immediate reread detected; keep the cleaner delivery?",
      confidence: explicitStrong || nextExplicitStrong ? 0.95 : aborted ? 0.86 : repaired ? 0.82 : includeRisky ? 0.76 : 0.8,
      index,
      category: explicitStrong || nextExplicitStrong
        ? "trigger_phrase_restart"
        : ((isLikelyAborted(removeTarget.text) && tokenCount(removeTarget.text) >= 12) ? "long_abandoned_restart" : "no_trigger_restart"),
    });
  }

  if (options.honorExplicitRetakePhrases) {
    for (let index = 0; index < sorted.length; index += 1) {
      const current = sorted[index]!;
      if (removeIds.has(current.segment_id)) continue;
      const currentTextRaw = normalizeTextSpacing(current.text);
      if (!currentTextRaw) continue;
      if (!RETAKE_PHRASES_STRONG.test(currentTextRaw)) continue;
      if (index <= 0) continue;

      const cueSplit = splitOnStrongRetakeCue(currentTextRaw);
      const markerOnly = isRetakeMarkerOnly(currentTextRaw);
      const inlineAfter = cueSplit?.after || stripRetakeCuePrefix(currentTextRaw);
      const preCandidates: HammerTranscriptSegment[] = [];
      for (let offset = 1; offset <= 2; offset += 1) {
        const preIndex = index - offset;
        if (preIndex < 0) break;
        const candidate = sorted[preIndex]!;
        if (removeIds.has(candidate.segment_id)) continue;
        const rightNeighbor = sorted[preIndex + 1]!;
        const gapToRight = Math.max(0, rightNeighbor.start_sec - candidate.end_sec);
        if (gapToRight > maxGapSec) break;
        if (!speakersCompatible(candidate, current)) continue;
        preCandidates.push(candidate);
      }
      if (preCandidates.length === 0) continue;

      const postCandidates: Array<{
        keepSegmentId: string;
        text: string;
        removeCurrentWithTrigger: boolean;
        trimCurrentTo?: string;
      }> = [];
      if (inlineAfter && tokenCount(inlineAfter) >= 2) {
        postCandidates.push({
          keepSegmentId: current.segment_id,
          text: inlineAfter,
          removeCurrentWithTrigger: false,
          trimCurrentTo: inlineAfter,
        });
      }
      for (let offset = 1; offset <= 2; offset += 1) {
        const postIndex = index + offset;
        if (postIndex >= sorted.length) break;
        const candidate = sorted[postIndex]!;
        if (removeIds.has(candidate.segment_id)) continue;
        const leftNeighbor = sorted[postIndex - 1]!;
        const gapToCandidate = Math.max(0, candidate.start_sec - leftNeighbor.end_sec);
        if (gapToCandidate > maxGapSec) break;
        if (!speakersCompatible(current, candidate)) continue;
        postCandidates.push({
          keepSegmentId: candidate.segment_id,
          text: candidate.text,
          removeCurrentWithTrigger: true,
        });
      }
      if (postCandidates.length === 0) continue;

      let bestMatch: {
        pre: HammerTranscriptSegment;
        post: {
          keepSegmentId: string;
          text: string;
          removeCurrentWithTrigger: boolean;
          trimCurrentTo?: string;
        };
        evidence: RestartEvidence;
      } | null = null;
      for (const pre of preCandidates) {
        for (const post of postCandidates) {
          const evidence = evaluateRestartEvidence(pre.text, post.text);
          if (!bestMatch || evidence.score > bestMatch.evidence.score) {
            bestMatch = { pre, post, evidence };
          }
        }
      }
      if (
        !bestMatch
        || bestMatch.evidence.score < 0.72
        || (!bestMatch.evidence.openingMatch && !bestMatch.evidence.intentMatch && !bestMatch.evidence.shortLeadInReread)
      ) {
        continue;
      }

      const removeSegmentIds = [bestMatch.pre.segment_id];
      const removeTriggerSegment = bestMatch.post.removeCurrentWithTrigger
        && (markerOnly || tokenCount(inlineAfter) < 3 || bestMatch.evidence.score >= 0.82);
      if (removeTriggerSegment) {
        removeSegmentIds.push(current.segment_id);
      } else if (bestMatch.post.trimCurrentTo) {
        pushRestartTrimSuggestion({
          segment: current,
          trimmedText: bestMatch.post.trimCurrentTo,
          description: "Possible retake detected (trigger + phrase restart). Remove trigger phrase and keep the restarted wording?",
          confidence: Math.max(0.8, bestMatch.evidence.score - 0.02),
          index,
        });
      }
      const preDurationSec = Math.max(0, bestMatch.pre.end_sec - bestMatch.pre.start_sec);
      const longAbandoned = preDurationSec >= 2 || tokenCount(bestMatch.pre.text) >= 12;
      pushRetakeSuggestion({
        removeSegmentIds,
        keepSegmentId: bestMatch.post.keepSegmentId,
        description: longAbandoned
          ? "Possible retake detected (long abandoned take + restart). Remove abandoned take and trigger; keep the clean restart?"
          : "Possible retake detected (trigger + phrase restart). Remove abandoned pre-trigger phrase and keep the restarted phrase?",
        confidence: Math.max(0.83, Math.min(0.97, bestMatch.evidence.score + (removeTriggerSegment ? 0.08 : 0.03))),
        index,
        category: longAbandoned ? "long_abandoned_restart" : "trigger_phrase_restart",
      });
    }
  }

  if (options.honorExplicitRetakePhrases && (options.detection === "normal" || options.detection === "aggressive")) {
    for (let index = 0; index < sorted.length; index += 1) {
      const segment = sorted[index]!;
      if (removeIds.has(segment.segment_id)) continue;
      const raw = normalizeTextSpacing(segment.text);
      if (!raw) continue;
      if (isRetakeMarkerOnly(raw)) continue;
      if (!RETAKE_PHRASES_STRONG.test(raw)) continue;

      const prefixTrimmed = stripRetakeCuePrefix(raw);
      if (prefixTrimmed && normalizeTextSpacing(prefixTrimmed) !== raw) {
        pushRestartTrimSuggestion({
          segment,
          trimmedText: prefixTrimmed,
          description: "Possible retake detected from an explicit restart cue. Remove restart trigger phrase?",
          confidence: 0.93,
          index,
        });
        continue;
      }

      const cueSplit = splitOnStrongRetakeCue(raw);
      if (cueSplit && cueSplit.before && cueSplit.after) {
        const evidence = evaluateRestartEvidence(cueSplit.before, cueSplit.after);
        if (evidence.score >= 0.74 && (evidence.openingMatch || evidence.intentMatch || evidence.shortLeadInReread)) {
          pushRestartTrimSuggestion({
            segment,
            trimmedText: cueSplit.after,
            description: "Possible retake detected (trigger + phrase restart in one take). Remove abandoned phrase and trigger, keep restarted phrase?",
            confidence: Math.max(0.82, evidence.score),
            index,
          });
        }
      }
    }
  }

  for (const segment of sorted) {
    if (removeIds.has(segment.segment_id)) continue;
    const update = restartTrimUpdates.get(segment.segment_id);
    if (!update) continue;
    segment.text = update.text;
  }

  const retakeKeepSegmentIds = new Set<string>();
  for (const suggestion of suggestions) {
    if (suggestion.type !== "retake_remove") continue;
    const parts = String(suggestion.id).split(":");
    if (parts[0] !== "retake_pair" && parts[0] !== "retake_chain") continue;
    const keepSegmentId = parts[2] ?? "";
    if (keepSegmentId) retakeKeepSegmentIds.add(keepSegmentId);
  }
  const filteredSuggestions = suggestions.filter((suggestion) => {
    if (suggestion.type !== "restart_trim") return true;
    if (removeIds.has(suggestion.segmentId)) return false;
    if (retakeKeepSegmentIds.has(suggestion.segmentId)) return false;
    return true;
  });
  const finalSuggestionsById = new Map<string, HammerCleanupSuggestion>();
  for (const suggestion of filteredSuggestions) {
    const existing = finalSuggestionsById.get(suggestion.id);
    if (!existing || suggestion.confidence > existing.confidence + 0.001) {
      finalSuggestionsById.set(suggestion.id, suggestion);
    }
  }
  const finalSuggestions = Array.from(finalSuggestionsById.values());
  const result = sorted.filter((segment) => !removeIds.has(segment.segment_id));
  return {
    label: "Remove Retakes",
    resultSegments: result,
    suggestions: finalSuggestions,
    summary: {
      changedSegments: finalSuggestions.length,
      removedSegments: removeIds.size,
      timeSavedSec: roundToTenth(finalSuggestions.reduce((sum, item) => sum + item.timeSavedSec, 0)),
    },
  };
}

export function previewTightenSelection(args: {
  segments: HammerTranscriptSegment[];
  segmentIds: string[];
}): HammerCleanupPreview {
  if (args.segmentIds.length === 0) {
    return {
      label: "Tighten Selection",
      resultSegments: cloneSegments(args.segments),
      suggestions: [],
      summary: {
        changedSegments: 0,
        removedSegments: 0,
        timeSavedSec: 0,
      },
      metadata: {
        tightenSelection: {
          intent: "Tighten this passage while preserving meaning.",
          beforeText: "",
          afterText: "",
          removedFillers: 0,
          collapsedRepetitions: 0,
          mergedFragments: 0,
          confidenceLabel: "Low",
          confidenceScore: 0.5,
          safetyNote: "Original performance preserved. Undo restores fully.",
        },
      },
    };
  }

  const idSet = new Set(args.segmentIds);
  const sorted = cloneSegments(args.segments).sort((a, b) => a.start_sec - b.start_sec);
  const beforeSelection = sorted.filter((segment) => idSet.has(segment.segment_id));
  const beforeText = beforeSelection.map((segment) => segment.text.trim()).filter(Boolean).join(" ");
  const suggestions: HammerCleanupSuggestion[] = [];
  const changed = new Set<string>();
  const removeIds = new Set<string>();
  let removedFillers = 0;
  let collapsedRepetitions = 0;
  let mergedFragments = 0;
  let confidencePenalty = 0;

  const fillerDictionary = [...FILLERS_MEDIUM, "actually", "right", "just"];

  for (const segment of sorted) {
    if (!idSet.has(segment.segment_id)) continue;

    const original = normalizeTextSpacing(segment.text);
    let working = original;

    const restart = trimRestartPrefix(working);
    working = restart.text;
    if (restart.trimmed) {
      suggestions.push({
        id: `tighten:restart:${segment.segment_id}`,
        type: "restart_trim",
        segmentId: segment.segment_id,
        description: "Trimmed restart phrase.",
        confidence: 0.9,
        timeSavedSec: 0.2,
      });
      changed.add(segment.segment_id);
      confidencePenalty += 0.02;
    }

    const filler = cleanFillerText(working, fillerDictionary);
    working = normalizeTextSpacing(filler.text);
    if (filler.removed > 0) {
      removedFillers += filler.removed;
      suggestions.push({
        id: `tighten:filler:${segment.segment_id}`,
        type: "filler_remove",
        segmentId: segment.segment_id,
        description: `Removed ${filler.removed} filler phrase${filler.removed === 1 ? "" : "s"}.`,
        confidence: 0.92,
        timeSavedSec: roundToTenth(Math.max(0.1, filler.removed * 0.12)),
      });
      changed.add(segment.segment_id);
    }

    const repeatedWordCollapse = collapseRepeatedSingleWords(working);
    working = normalizeTextSpacing(repeatedWordCollapse.text);
    if (repeatedWordCollapse.collapsed > 0) {
      collapsedRepetitions += repeatedWordCollapse.collapsed;
      suggestions.push({
        id: `tighten:repeat-word:${segment.segment_id}`,
        type: "repetition_collapse",
        segmentId: segment.segment_id,
        description: `Collapsed repeated words (${repeatedWordCollapse.collapsed}).`,
        confidence: 0.89,
        timeSavedSec: roundToTenth(Math.max(0.1, repeatedWordCollapse.collapsed * 0.08)),
      });
      changed.add(segment.segment_id);
      confidencePenalty += 0.03;
    }

    const repeatedPhraseCollapse = collapseRepeatedShortPhrases(working);
    working = normalizeTextSpacing(repeatedPhraseCollapse.text);
    if (repeatedPhraseCollapse.collapsed > 0) {
      collapsedRepetitions += repeatedPhraseCollapse.collapsed;
      suggestions.push({
        id: `tighten:repeat-phrase:${segment.segment_id}`,
        type: "repetition_collapse",
        segmentId: segment.segment_id,
        description: `Collapsed repeated phrase (${repeatedPhraseCollapse.collapsed}).`,
        confidence: 0.82,
        timeSavedSec: roundToTenth(Math.max(0.1, repeatedPhraseCollapse.collapsed * 0.12)),
      });
      changed.add(segment.segment_id);
      confidencePenalty += 0.05;
    }

    const tail = trimWanderingTail(working);
    working = tail.text;
    if (tail.trimmed) {
      suggestions.push({
        id: `tighten:tail:${segment.segment_id}`,
        type: "restart_trim",
        segmentId: segment.segment_id,
        description: "Trimmed wandering tail phrase.",
        confidence: 0.78,
        timeSavedSec: 0.2,
      });
      changed.add(segment.segment_id);
      confidencePenalty += 0.06;
    }

    if (isLikelyFragment(working)) {
      removeIds.add(segment.segment_id);
      mergedFragments += 1;
      const durationSec = roundToTenth(Math.max(0.1, segment.end_sec - segment.start_sec));
      suggestions.push({
        id: `tighten:fragment:${segment.segment_id}`,
        type: "fragment_merge",
        segmentId: segment.segment_id,
        description: "Removed fragment that does not carry unique meaning.",
        confidence: 0.74,
        timeSavedSec: durationSec,
      });
      changed.add(segment.segment_id);
      confidencePenalty += 0.08;
      continue;
    }

    if (working && working !== segment.text) {
      segment.text = working;
    }
  }

  let cumulativeShift = 0;
  const resultSegments: HammerTranscriptSegment[] = [];
  for (const segment of sorted) {
    const duration = roundToTenth(Math.max(0.1, segment.end_sec - segment.start_sec));
    if (removeIds.has(segment.segment_id)) {
      cumulativeShift = roundToTenth(cumulativeShift + duration);
      continue;
    }
    const nextStart = roundToTenth(Math.max(0, segment.start_sec - cumulativeShift));
    resultSegments.push({
      ...segment,
      start_sec: nextStart,
      end_sec: roundToTenth(nextStart + duration),
    });
  }

  const afterSelection = resultSegments.filter((segment) => idSet.has(segment.segment_id));
  const afterText = afterSelection.map((segment) => segment.text.trim()).filter(Boolean).join(" ");
  const baseScore = Math.max(0.55, Math.min(0.97, 0.95 - confidencePenalty));
  const confidenceScore = Number(baseScore.toFixed(2));
  const confidenceLabel = confidenceScore >= 0.85 ? "High" : confidenceScore >= 0.7 ? "Medium" : "Low";

  return {
    label: "Tighten Selection",
    resultSegments,
    suggestions,
    summary: {
      changedSegments: changed.size,
      removedSegments: removeIds.size,
      timeSavedSec: roundToTenth(suggestions.reduce((sum, item) => sum + item.timeSavedSec, 0)),
    },
    metadata: {
      tightenSelection: {
        intent: "Tighten this passage while preserving meaning.",
        beforeText,
        afterText,
        removedFillers,
        collapsedRepetitions,
        mergedFragments,
        confidenceLabel,
        confidenceScore,
        safetyNote: "Original performance preserved. Undo restores fully.",
      },
    },
  };
}

export function previewSpeakerSolo(args: {
  segments: HammerTranscriptSegment[];
  options: SpeakerSoloOptions;
  segmentIds?: string[];
}): HammerCleanupPreview {
  const sorted = cloneSegments(args.segments).sort((a, b) => a.start_sec - b.start_sec);
  const scopeSet = args.segmentIds && args.segmentIds.length > 0 ? new Set(args.segmentIds) : null;
  const scopeLabel = scopeSet
    ? `${scopeSet.size} selected segment${scopeSet.size === 1 ? "" : "s"}`
    : "full transcript";
  const suggestions: HammerCleanupSuggestion[] = [];
  const changed = new Set<string>();
  const resultSegments = sorted.map((segment) => ({ ...segment }));
  let suppressedSegments = 0;
  let collapsedInterruptions = 0;
  let estimatedDurationSavedSec = 0;

  for (let index = 0; index < resultSegments.length; index += 1) {
    const segment = resultSegments[index];
    if (scopeSet && !scopeSet.has(segment.segment_id)) continue;
    if (segment.speaker === args.options.targetSpeaker) continue;

    const previous = resultSegments[index - 1];
    const next = resultSegments[index + 1];
    const durationSec = roundToTenth(Math.max(0.1, segment.end_sec - segment.start_sec));
    const qualifiesAsInterruption = Boolean(
      args.options.collapseInterruptions
      && previous
      && next
      && previous.speaker === args.options.targetSpeaker
      && next.speaker === args.options.targetSpeaker
      && durationSec <= Math.max(0.2, args.options.maxInterruptionSec),
    );

    if (qualifiesAsInterruption) {
      collapsedInterruptions += 1;
    }

    if (segment.is_disabled === true) continue;

    segment.is_disabled = true;
    changed.add(segment.segment_id);
    suppressedSegments += 1;
    estimatedDurationSavedSec = roundToTenth(estimatedDurationSavedSec + durationSec);

    suggestions.push({
      id: `solo:${segment.segment_id}`,
      type: "fragment_merge",
      segmentId: segment.segment_id,
      description: qualifiesAsInterruption
        ? "Collapsed brief interruption from non-target speaker."
        : "Suppressed non-target speaker segment in Solo Mode.",
      confidence: qualifiesAsInterruption ? 0.92 : 0.88,
      timeSavedSec: durationSec,
    });
  }

  if (args.options.compressGaps) {
    let cumulativeShift = 0;
    for (const segment of resultSegments) {
      const durationSec = roundToTenth(Math.max(0.1, segment.end_sec - segment.start_sec));
      if (segment.is_disabled === true && (!scopeSet || scopeSet.has(segment.segment_id))) {
        cumulativeShift = roundToTenth(cumulativeShift + durationSec);
        continue;
      }
      if (cumulativeShift <= 0) continue;
      const nextStart = roundToTenth(Math.max(0, segment.start_sec - cumulativeShift));
      const nextEnd = roundToTenth(nextStart + durationSec);
      if (nextStart !== segment.start_sec || nextEnd !== segment.end_sec) {
        segment.start_sec = nextStart;
        segment.end_sec = nextEnd;
        changed.add(segment.segment_id);
      }
    }
  }

  const confidencePenalty = Math.min(0.2, suppressedSegments * 0.01) + (args.options.compressGaps ? 0.05 : 0);
  const confidenceScore = Number(Math.max(0.65, 0.96 - confidencePenalty).toFixed(2));
  const confidenceLabel = confidenceScore >= 0.85 ? "High" : confidenceScore >= 0.72 ? "Medium" : "Low";

  return {
    label: "Solo Mode",
    resultSegments,
    suggestions,
    summary: {
      changedSegments: changed.size,
      removedSegments: 0,
      timeSavedSec: estimatedDurationSavedSec,
    },
    metadata: {
      speakerSolo: {
        intent: "Keep one speaker in focus and suppress non-target voices without touching source truth.",
        targetSpeaker: args.options.targetSpeaker,
        scopeLabel,
        suppressedSegments,
        collapsedInterruptions,
        estimatedDurationSavedSec,
        confidenceLabel,
        confidenceScore,
        safetyNote: "Source transcript and media remain recoverable. Undo restores the prior state in one step.",
      },
    },
  };
}

const INTERVIEW_BACKCHANNEL_RE = /^(?:mm-?hmm|mhm|yeah|yep|right|got it|okay|ok|sure|uh-huh|huh)$/i;
const INTERVIEW_RETAKE_RE = /\b(?:let me start over|scratch that|take that again|redo|retake)\b/i;

export function previewSpeakerMonologue(args: {
  segments: HammerTranscriptSegment[];
  options: SpeakerMonologueOptions;
  segmentIds?: string[];
}): HammerCleanupPreview {
  const sorted = cloneSegments(args.segments).sort((a, b) => a.start_sec - b.start_sec);
  const scopeSet = args.segmentIds && args.segmentIds.length > 0 ? new Set(args.segmentIds) : null;
  const suggestions: HammerCleanupSuggestion[] = [];
  const changed = new Set<string>();
  const resultSegments = sorted.map((segment) => ({ ...segment }));
  const fillerDictionary = FILLERS_MEDIUM;
  const tightenedTargetSegmentIds = new Set<string>();
  let backchannelsRemoved = 0;
  let interruptionsSuppressed = 0;
  let estimatedDurationSavedSec = 0;

  for (let index = 0; index < resultSegments.length; index += 1) {
    const segment = resultSegments[index];
    if (scopeSet && !scopeSet.has(segment.segment_id)) continue;
    const durationSec = roundToTenth(Math.max(0.1, segment.end_sec - segment.start_sec));

    if (segment.speaker !== args.options.targetSpeaker) {
      const previous = resultSegments[index - 1];
      const next = resultSegments[index + 1];
      const normalizedText = normalizeTextSpacing(segment.text);
      const isBackchannel = args.options.removeBackchannels
        && tokenCount(normalizedText) <= 4
        && INTERVIEW_BACKCHANNEL_RE.test(normalizedText);
      const isShortInterruption = args.options.suppressInterruptions
        && previous
        && next
        && previous.speaker === args.options.targetSpeaker
        && next.speaker === args.options.targetSpeaker
        && durationSec <= Math.max(0.2, args.options.maxInterruptionSec);

      if ((isBackchannel || isShortInterruption) && segment.is_disabled !== true) {
        segment.is_disabled = true;
        changed.add(segment.segment_id);
        estimatedDurationSavedSec = roundToTenth(estimatedDurationSavedSec + durationSec);
        if (isBackchannel) {
          backchannelsRemoved += 1;
        } else {
          interruptionsSuppressed += 1;
        }
        suggestions.push({
          id: `monologue:${segment.segment_id}`,
          type: "fragment_merge",
          segmentId: segment.segment_id,
          description: isBackchannel
            ? "Removed non-essential backchannel outside the target speaker's through-line."
            : "Suppressed short interruption between adjacent target-speaker runs.",
          confidence: isBackchannel ? 0.9 : 0.86,
          timeSavedSec: durationSec,
        });
      }
      continue;
    }

    if (!args.options.tightenTargetRuns) {
      continue;
    }

    const original = normalizeTextSpacing(segment.text);
    let working = original;
    let segmentChanged = false;

    const restart = trimRestartPrefix(working);
    if (restart.trimmed) {
      working = restart.text;
      segmentChanged = true;
      suggestions.push({
        id: `monologue:restart:${segment.segment_id}`,
        type: "restart_trim",
        segmentId: segment.segment_id,
        description: "Trimmed restart phrase in target-speaker run.",
        confidence: 0.88,
        timeSavedSec: 0.2,
      });
    }

    const filler = cleanFillerText(working, fillerDictionary);
    if (filler.removed > 0) {
      working = normalizeTextSpacing(filler.text);
      segmentChanged = true;
      suggestions.push({
        id: `monologue:filler:${segment.segment_id}`,
        type: "filler_remove",
        segmentId: segment.segment_id,
        description: `Removed ${filler.removed} filler phrase${filler.removed === 1 ? "" : "s"} in target-speaker run.`,
        confidence: 0.87,
        timeSavedSec: roundToTenth(Math.max(0.1, filler.removed * 0.11)),
      });
    }

    const repeatedWordCollapse = collapseRepeatedSingleWords(working);
    if (repeatedWordCollapse.collapsed > 0) {
      working = normalizeTextSpacing(repeatedWordCollapse.text);
      segmentChanged = true;
      suggestions.push({
        id: `monologue:repeat-word:${segment.segment_id}`,
        type: "repetition_collapse",
        segmentId: segment.segment_id,
        description: `Collapsed repeated words (${repeatedWordCollapse.collapsed}) in target-speaker run.`,
        confidence: 0.83,
        timeSavedSec: roundToTenth(Math.max(0.1, repeatedWordCollapse.collapsed * 0.08)),
      });
    }

    const repeatedPhraseCollapse = collapseRepeatedShortPhrases(working);
    if (repeatedPhraseCollapse.collapsed > 0) {
      working = normalizeTextSpacing(repeatedPhraseCollapse.text);
      segmentChanged = true;
      suggestions.push({
        id: `monologue:repeat-phrase:${segment.segment_id}`,
        type: "repetition_collapse",
        segmentId: segment.segment_id,
        description: `Collapsed repeated short phrase (${repeatedPhraseCollapse.collapsed}) in target-speaker run.`,
        confidence: 0.79,
        timeSavedSec: roundToTenth(Math.max(0.1, repeatedPhraseCollapse.collapsed * 0.1)),
      });
    }

    const tail = trimWanderingTail(working);
    if (tail.trimmed) {
      working = tail.text;
      segmentChanged = true;
      suggestions.push({
        id: `monologue:tail:${segment.segment_id}`,
        type: "restart_trim",
        segmentId: segment.segment_id,
        description: "Trimmed wandering tail in target-speaker run.",
        confidence: 0.76,
        timeSavedSec: 0.2,
      });
    }

    if (segmentChanged && working && working !== segment.text) {
      segment.text = working;
      tightenedTargetSegmentIds.add(segment.segment_id);
      changed.add(segment.segment_id);
    }
  }

  if (args.options.compressGaps) {
    let cumulativeShift = 0;
    for (const segment of resultSegments) {
      const durationSec = roundToTenth(Math.max(0.1, segment.end_sec - segment.start_sec));
      if (segment.is_disabled === true && (!scopeSet || scopeSet.has(segment.segment_id))) {
        cumulativeShift = roundToTenth(cumulativeShift + durationSec);
        continue;
      }
      if (cumulativeShift <= 0) continue;
      const nextStart = roundToTenth(Math.max(0, segment.start_sec - cumulativeShift));
      const nextEnd = roundToTenth(nextStart + durationSec);
      if (nextStart !== segment.start_sec || nextEnd !== segment.end_sec) {
        segment.start_sec = nextStart;
        segment.end_sec = nextEnd;
        changed.add(segment.segment_id);
      }
    }
  }

  estimatedDurationSavedSec = roundToTenth(suggestions.reduce((sum, suggestion) => sum + suggestion.timeSavedSec, 0));
  const sameSpeakerRunsTightened = tightenedTargetSegmentIds.size;
  const confidencePenalty = Math.min(0.26, (backchannelsRemoved * 0.015) + (interruptionsSuppressed * 0.02) + (args.options.compressGaps ? 0.04 : 0));
  const confidenceScore = Number(Math.max(0.63, 0.94 - confidencePenalty).toFixed(2));
  const confidenceLabel = confidenceScore >= 0.85 ? "High" : confidenceScore >= 0.72 ? "Medium" : "Low";

  return {
    label: "Monologue Cleanup",
    resultSegments,
    suggestions,
    summary: {
      changedSegments: changed.size,
      removedSegments: backchannelsRemoved + interruptionsSuppressed,
      timeSavedSec: estimatedDurationSavedSec,
    },
    metadata: {
      speakerMonologue: {
        intent: "Keep one speaker's through-line readable by suppressing brief outside interruptions and tightening filler-heavy target runs.",
        targetSpeaker: args.options.targetSpeaker,
        backchannelsRemoved,
        interruptionsSuppressed,
        sameSpeakerRunsTightened,
        estimatedDurationSavedSec,
        confidenceLabel,
        confidenceScore,
        safetyNote: "Creates a derived layer only. Source transcript and media remain recoverable. Undo restores the prior state in one step.",
      },
    },
  };
}

export function previewSpeakerInterview(args: {
  segments: HammerTranscriptSegment[];
  options: SpeakerInterviewOptions;
  segmentIds?: string[];
}): HammerCleanupPreview {
  const sorted = cloneSegments(args.segments).sort((a, b) => a.start_sec - b.start_sec);
  const scopeSet = args.segmentIds && args.segmentIds.length > 0 ? new Set(args.segmentIds) : null;
  const suggestions: HammerCleanupSuggestion[] = [];
  const changed = new Set<string>();
  const resultSegments = sorted.map((segment) => ({ ...segment }));
  const fillerDictionary = args.options.tightness === "tight"
    ? FILLERS_STRONG
    : args.options.tightness === "medium"
    ? FILLERS_MEDIUM
    : FILLERS_LIGHT;
  let promptsKept = 0;
  let answerSegmentsTightened = 0;
  let fillersRemoved = 0;
  let retakesRemoved = 0;
  let interruptionsSuppressed = 0;
  let estimatedDurationSavedSec = 0;

  for (let index = 0; index < resultSegments.length; index += 1) {
    const segment = resultSegments[index];
    if (scopeSet && !scopeSet.has(segment.segment_id)) continue;
    const durationSec = roundToTenth(Math.max(0.1, segment.end_sec - segment.start_sec));
    const isHost = segment.speaker === args.options.hostSpeaker;
    const isRespondent = segment.speaker === args.options.respondentSpeaker;

    if (isHost) {
      promptsKept += 1;
      continue;
    }

    if (!isRespondent) {
      const shortInterruption = args.options.collapseInterruptions && durationSec <= Math.max(0.2, args.options.maxInterruptionSec);
      if (shortInterruption && segment.is_disabled !== true) {
        segment.is_disabled = true;
        interruptionsSuppressed += 1;
        changed.add(segment.segment_id);
        estimatedDurationSavedSec = roundToTenth(estimatedDurationSavedSec + durationSec);
        suggestions.push({
          id: `interview:interrupt:${segment.segment_id}`,
          type: "fragment_merge",
          segmentId: segment.segment_id,
          description: "Suppressed short interruption outside host/respondent flow.",
          confidence: 0.85,
          timeSavedSec: durationSec,
        });
      }
      continue;
    }

    const original = normalizeTextSpacing(segment.text);
    let working = original;

    if (args.options.removeBackchannels && INTERVIEW_BACKCHANNEL_RE.test(working) && segment.is_disabled !== true) {
      segment.is_disabled = true;
      retakesRemoved += 1;
      changed.add(segment.segment_id);
      estimatedDurationSavedSec = roundToTenth(estimatedDurationSavedSec + durationSec);
      suggestions.push({
        id: `interview:backchannel:${segment.segment_id}`,
        type: "retake_remove",
        segmentId: segment.segment_id,
        description: "Removed brief respondent backchannel for tighter answer flow.",
        confidence: 0.89,
        timeSavedSec: durationSec,
      });
      continue;
    }

    const restart = trimRestartPrefix(working);
    if (restart.trimmed) {
      working = restart.text;
      suggestions.push({
        id: `interview:restart:${segment.segment_id}`,
        type: "restart_trim",
        segmentId: segment.segment_id,
        description: "Trimmed respondent restart phrase.",
        confidence: 0.87,
        timeSavedSec: 0.2,
      });
      changed.add(segment.segment_id);
    }

    const filler = cleanFillerText(working, fillerDictionary);
    if (filler.removed > 0) {
      fillersRemoved += filler.removed;
      working = normalizeTextSpacing(filler.text);
      suggestions.push({
        id: `interview:filler:${segment.segment_id}`,
        type: "filler_remove",
        segmentId: segment.segment_id,
        description: `Removed ${filler.removed} filler phrase${filler.removed === 1 ? "" : "s"} in respondent answer.`,
        confidence: 0.88,
        timeSavedSec: roundToTenth(Math.max(0.1, filler.removed * 0.11)),
      });
      changed.add(segment.segment_id);
    }

    const repeatedWordCollapse = collapseRepeatedSingleWords(working);
    if (repeatedWordCollapse.collapsed > 0) {
      working = normalizeTextSpacing(repeatedWordCollapse.text);
      suggestions.push({
        id: `interview:repeat-word:${segment.segment_id}`,
        type: "repetition_collapse",
        segmentId: segment.segment_id,
        description: `Collapsed repeated words (${repeatedWordCollapse.collapsed}) in respondent answer.`,
        confidence: 0.84,
        timeSavedSec: roundToTenth(Math.max(0.1, repeatedWordCollapse.collapsed * 0.08)),
      });
      changed.add(segment.segment_id);
    }

    const repeatedPhraseCollapse = collapseRepeatedShortPhrases(working);
    if (repeatedPhraseCollapse.collapsed > 0) {
      working = normalizeTextSpacing(repeatedPhraseCollapse.text);
      suggestions.push({
        id: `interview:repeat-phrase:${segment.segment_id}`,
        type: "repetition_collapse",
        segmentId: segment.segment_id,
        description: `Collapsed repeated short phrase (${repeatedPhraseCollapse.collapsed}) in respondent answer.`,
        confidence: 0.8,
        timeSavedSec: roundToTenth(Math.max(0.1, repeatedPhraseCollapse.collapsed * 0.1)),
      });
      changed.add(segment.segment_id);
    }

    const tail = trimWanderingTail(working);
    if (tail.trimmed) {
      working = tail.text;
      suggestions.push({
        id: `interview:tail:${segment.segment_id}`,
        type: "restart_trim",
        segmentId: segment.segment_id,
        description: "Trimmed wandering answer tail.",
        confidence: 0.77,
        timeSavedSec: 0.2,
      });
      changed.add(segment.segment_id);
    }

    if (INTERVIEW_RETAKE_RE.test(original) && segment.is_disabled !== true) {
      segment.is_disabled = true;
      retakesRemoved += 1;
      changed.add(segment.segment_id);
      estimatedDurationSavedSec = roundToTenth(estimatedDurationSavedSec + durationSec);
      suggestions.push({
        id: `interview:retake:${segment.segment_id}`,
        type: "retake_remove",
        segmentId: segment.segment_id,
        description: "Removed explicit respondent retake line.",
        confidence: 0.91,
        timeSavedSec: durationSec,
      });
      continue;
    }

    if (working && working !== segment.text) {
      segment.text = working;
      answerSegmentsTightened += 1;
    }
  }

  estimatedDurationSavedSec = roundToTenth(suggestions.reduce((sum, suggestion) => sum + suggestion.timeSavedSec, 0));
  const confidencePenalty = Math.min(0.25, (retakesRemoved + interruptionsSuppressed) * 0.015);
  const confidenceScore = Number(Math.max(0.64, 0.93 - confidencePenalty).toFixed(2));
  const confidenceLabel = confidenceScore >= 0.85 ? "High" : confidenceScore >= 0.72 ? "Medium" : "Low";

  return {
    label: "Interview Mode",
    resultSegments,
    suggestions,
    summary: {
      changedSegments: changed.size,
      removedSegments: retakesRemoved + interruptionsSuppressed,
      timeSavedSec: estimatedDurationSavedSec,
    },
    metadata: {
      speakerInterview: {
        intent: "Keep host prompts intact while tightening respondent answers for clearer interview flow.",
        hostSpeaker: args.options.hostSpeaker,
        respondentSpeaker: args.options.respondentSpeaker,
        promptsKept,
        answerSegmentsTightened,
        fillersRemoved,
        retakesRemoved,
        interruptionsSuppressed,
        estimatedDurationSavedSec,
        confidenceLabel,
        confidenceScore,
        safetyNote: "Source transcript and media remain recoverable. Undo restores the prior state in one step.",
      },
    },
  };
}

function isPanelBackchannel(text: string): boolean {
  const normalized = normalizeTextSpacing(text);
  if (!normalized) return false;
  if (tokenCount(normalized) > 4) return false;
  return INTERVIEW_BACKCHANNEL_RE.test(normalized);
}

export function previewSpeakerPanel(args: {
  segments: HammerTranscriptSegment[];
  options: SpeakerPanelOptions;
  segmentIds?: string[];
}): HammerCleanupPreview {
  const sorted = cloneSegments(args.segments).sort((a, b) => a.start_sec - b.start_sec);
  const scopeSet = args.segmentIds && args.segmentIds.length > 0 ? new Set(args.segmentIds) : null;
  const scopeLabel = scopeSet
    ? `${scopeSet.size} selected segment${scopeSet.size === 1 ? "" : "s"}`
    : "full transcript";
  const suggestions: HammerCleanupSuggestion[] = [];
  const changed = new Set<string>();
  const resultSegments = sorted.map((segment) => ({ ...segment }));
  let backchannelsRemoved = 0;
  let crossTalkSegmentsSuppressed = 0;
  let estimatedDurationSavedSec = 0;

  for (let index = 0; index < resultSegments.length; index += 1) {
    const segment = resultSegments[index];
    if (scopeSet && !scopeSet.has(segment.segment_id)) continue;
    if (segment.is_disabled === true) continue;

    const durationSec = roundToTenth(Math.max(0.1, segment.end_sec - segment.start_sec));
    const previous = resultSegments[index - 1];
    const next = resultSegments[index + 1];
    const sameSpeakerEnvelope = Boolean(
      previous
      && next
      && previous.speaker === next.speaker
      && previous.speaker !== segment.speaker,
    );
    const shortInterruption = sameSpeakerEnvelope
      && durationSec <= Math.max(0.2, args.options.maxInterruptionSec);
    const isBackchannel = args.options.removeShortBackchannels && isPanelBackchannel(segment.text);
    const speakerIsHost = segment.speaker === args.options.hostSpeaker;
    const preserveByBias = args.options.primarySpeakerBias === "host_favoring" && speakerIsHost;

    let shouldSuppress = false;
    let reason = "";
    let confidence = 0.86;
    if (isBackchannel && !preserveByBias) {
      shouldSuppress = true;
      reason = "Removed low-signal backchannel in panel flow.";
      confidence = 0.91;
      backchannelsRemoved += 1;
    } else if (args.options.suppressShortCrossTalk && shortInterruption && !preserveByBias) {
      shouldSuppress = true;
      reason = "Suppressed short cross-talk interruption between adjacent same-speaker turns.";
      confidence = args.options.primarySpeakerBias === "none" ? 0.84 : 0.88;
      crossTalkSegmentsSuppressed += 1;
    }

    if (!shouldSuppress) continue;
    segment.is_disabled = true;
    changed.add(segment.segment_id);
    estimatedDurationSavedSec = roundToTenth(estimatedDurationSavedSec + durationSec);
    suggestions.push({
      id: `panel:${segment.segment_id}:${index}`,
      type: "fragment_merge",
      segmentId: segment.segment_id,
      description: reason,
      confidence,
      timeSavedSec: durationSec,
    });
  }

  const turnsPreserved = resultSegments.filter((segment) => segment.is_disabled !== true).length;
  const confidencePenalty = Math.min(
    0.24,
    (backchannelsRemoved * 0.015)
      + (crossTalkSegmentsSuppressed * 0.018)
      + (args.options.primarySpeakerBias === "none" ? 0.06 : 0.03),
  );
  const confidenceScore = Number(Math.max(0.66, 0.93 - confidencePenalty).toFixed(2));
  const confidenceLabel = confidenceScore >= 0.85 ? "High" : confidenceScore >= 0.72 ? "Medium" : "Low";

  return {
    label: "Panel Mode",
    resultSegments,
    suggestions,
    summary: {
      changedSegments: changed.size,
      removedSegments: backchannelsRemoved + crossTalkSegmentsSuppressed,
      timeSavedSec: estimatedDurationSavedSec,
    },
    metadata: {
      speakerPanel: {
        intent: "Preserve panel turn structure while reducing low-signal backchannels and short cross-talk clutter.",
        participantScope: scopeLabel,
        hostSpeaker: args.options.hostSpeaker,
        primarySpeakerBias: args.options.primarySpeakerBias,
        backchannelsRemoved,
        crossTalkSegmentsSuppressed,
        turnsPreserved,
        estimatedDurationSavedSec,
        confidenceLabel,
        confidenceScore,
        safetyNote: "Preserves speaker structure while reducing low-signal overlap and backchannels. Source transcript and media remain recoverable.",
      },
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
