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
