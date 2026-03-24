import type { ReactNode } from "react";
import type {
  CleanupSuggestionType,
  HammerCleanupPreview,
} from "./hammerCleanupTools";

export type HammerPolishToolId =
  | "shorten_gaps"
  | "remove_fillers"
  | "remove_retakes"
  | "quick_clean"
  | "tighten_selection"
  | "solo_mode"
  | "interview_mode"
  | "monologue_cleanup"
  | "panel_mode";

export type HammerPolishResultSummary = {
  tool: HammerPolishToolId;
  label: string;
  detected: number;
  applied: number;
  affectedSegments: number;
  removedSegments: number;
  estimatedSecondsSaved: number;
  confidence: number | null;
  categories: Array<{ key: CleanupSuggestionType; label: string; count: number }>;
  notes: string[];
  sequence: string[];
  undoAvailable: boolean;
};

type PolishResultSummaryProps = {
  phase: "preview" | "applied";
  summary: HammerPolishResultSummary;
  children?: ReactNode;
};

const CATEGORY_LABELS: Record<CleanupSuggestionType, string> = {
  gap_trim: "Gap trims",
  filler_remove: "Filler removals",
  retake_remove: "Retake removals",
  repetition_collapse: "Repetition collapses",
  restart_trim: "Restart trims",
  fragment_merge: "Fragment merges",
};

const QUICK_CLEAN_SEQUENCE = [
  "Remove Retakes",
  "Remove Fillers",
  "Shorten Gaps",
];

function resolveToolId(label: string): HammerPolishToolId {
  const normalized = label.trim().toLowerCase();
  if (normalized === "shorten gaps") return "shorten_gaps";
  if (normalized === "remove fillers") return "remove_fillers";
  if (normalized === "remove retakes") return "remove_retakes";
  if (normalized === "tighten selection") return "tighten_selection";
  if (normalized === "solo mode") return "solo_mode";
  if (normalized === "interview mode") return "interview_mode";
  if (normalized === "monologue cleanup") return "monologue_cleanup";
  if (normalized === "panel mode") return "panel_mode";
  return "quick_clean";
}

export function buildPolishResultSummaryFromCleanupPreview(
  preview: HammerCleanupPreview,
): HammerPolishResultSummary {
  const tool = resolveToolId(preview.label);
  const categoryCounts = new Map<CleanupSuggestionType, number>();
  for (const suggestion of preview.suggestions) {
    categoryCounts.set(
      suggestion.type,
      (categoryCounts.get(suggestion.type) ?? 0) + 1,
    );
  }

  const categories = [...categoryCounts.entries()]
    .map(([key, count]) => ({
      key,
      label: CATEGORY_LABELS[key],
      count,
    }))
    .sort((left, right) => right.count - left.count);

  const confidence = preview.suggestions.length > 0
    ? preview.suggestions.reduce((sum, suggestion) => sum + suggestion.confidence, 0) / preview.suggestions.length
    : null;

  const notes: string[] = [];
  if (preview.suggestions.length === 0) {
    notes.push("No qualifying edits detected.");
  }
  if (preview.metadata?.tightenSelection) {
    notes.push(`Removed fillers: ${preview.metadata.tightenSelection.removedFillers}`);
    notes.push(`Collapsed repetitions: ${preview.metadata.tightenSelection.collapsedRepetitions}`);
    notes.push(`Merged fragments: ${preview.metadata.tightenSelection.mergedFragments}`);
    notes.push(`Confidence: ${preview.metadata.tightenSelection.confidenceLabel}`);
    notes.push(preview.metadata.tightenSelection.safetyNote);
  }
  if (preview.metadata?.speakerSolo) {
    notes.push(`Target speaker: ${preview.metadata.speakerSolo.targetSpeaker}`);
    notes.push(`Scope: ${preview.metadata.speakerSolo.scopeLabel}`);
    notes.push(`Suppressed non-target segments: ${preview.metadata.speakerSolo.suppressedSegments}`);
    notes.push(`Collapsed interruptions: ${preview.metadata.speakerSolo.collapsedInterruptions}`);
    notes.push(`Confidence: ${preview.metadata.speakerSolo.confidenceLabel}`);
    notes.push(preview.metadata.speakerSolo.safetyNote);
  }
  if (preview.metadata?.speakerInterview) {
    notes.push(`Host: ${preview.metadata.speakerInterview.hostSpeaker}`);
    notes.push(`Respondent: ${preview.metadata.speakerInterview.respondentSpeaker}`);
    notes.push(`Prompts kept: ${preview.metadata.speakerInterview.promptsKept}`);
    notes.push(`Answers tightened: ${preview.metadata.speakerInterview.answerSegmentsTightened}`);
    notes.push(`Interruptions suppressed: ${preview.metadata.speakerInterview.interruptionsSuppressed}`);
    notes.push(`Confidence: ${preview.metadata.speakerInterview.confidenceLabel}`);
    notes.push(preview.metadata.speakerInterview.safetyNote);
  }
  if (preview.metadata?.speakerMonologue) {
    notes.push(`Target speaker: ${preview.metadata.speakerMonologue.targetSpeaker}`);
    notes.push(`Backchannels removed: ${preview.metadata.speakerMonologue.backchannelsRemoved}`);
    notes.push(`Interruptions suppressed: ${preview.metadata.speakerMonologue.interruptionsSuppressed}`);
    notes.push(`Same-speaker runs tightened: ${preview.metadata.speakerMonologue.sameSpeakerRunsTightened}`);
    notes.push(`Confidence: ${preview.metadata.speakerMonologue.confidenceLabel}`);
    notes.push(preview.metadata.speakerMonologue.safetyNote);
  }
  if (preview.metadata?.speakerPanel) {
    notes.push(`Participant scope: ${preview.metadata.speakerPanel.participantScope}`);
    notes.push(`Host: ${preview.metadata.speakerPanel.hostSpeaker}`);
    notes.push(`Backchannels removed: ${preview.metadata.speakerPanel.backchannelsRemoved}`);
    notes.push(`Cross-talk suppressed: ${preview.metadata.speakerPanel.crossTalkSegmentsSuppressed}`);
    notes.push(`Turns preserved: ${preview.metadata.speakerPanel.turnsPreserved}`);
    notes.push(`Confidence: ${preview.metadata.speakerPanel.confidenceLabel}`);
    notes.push(preview.metadata.speakerPanel.safetyNote);
  }

  return {
    tool,
    label: preview.label,
    detected: preview.suggestions.length,
    applied: preview.suggestions.length,
    affectedSegments: preview.summary.changedSegments,
    removedSegments: preview.summary.removedSegments,
    estimatedSecondsSaved: preview.summary.timeSavedSec,
    confidence,
    categories,
    notes,
    sequence: tool === "quick_clean" ? QUICK_CLEAN_SEQUENCE : [],
    undoAvailable: true,
  };
}

export default function PolishResultSummary(
  props: PolishResultSummaryProps,
) {
  const { phase, summary, children } = props;
  return (
    <section
      className={[
        "hammer-polish-result-summary",
        phase === "preview" ? "hammer-polish-result-summary--preview" : "hammer-polish-result-summary--applied",
      ].join(" ")}
      aria-label={phase === "preview" ? "Polish preview summary" : "Polish apply receipt"}
    >
      <div className="hammer-polish-result-summary__head">
        <strong>{phase === "preview" ? "What Is Proposed" : "What Happened"}</strong>
        <span>{summary.label}</span>
      </div>
      <div className="hammer-polish-result-summary__metrics">
        <span>{phase === "preview" ? `${summary.detected} detected` : `${summary.applied} applied`}</span>
        <span>{summary.affectedSegments} segments affected</span>
        <span>{summary.removedSegments} removed</span>
        <span>{summary.estimatedSecondsSaved.toFixed(1)}s saved</span>
        <span>
          Confidence {summary.confidence == null ? "n/a" : `${Math.round(summary.confidence * 100)}%`}
        </span>
      </div>
      {summary.categories.length > 0 ? (
        <div className="hammer-polish-result-summary__categories">
          {summary.categories.map((category) => (
            <span key={category.key}>{category.label}: {category.count}</span>
          ))}
        </div>
      ) : null}
      {summary.sequence.length > 0 ? (
        <div className="hammer-polish-result-summary__sequence">
          Runs in order: {summary.sequence.join(" -> ")}
        </div>
      ) : null}
      {summary.notes.length > 0 ? (
        <div className="hammer-polish-result-summary__notes">
          {summary.notes.map((note) => (
            <span key={note}>{note}</span>
          ))}
        </div>
      ) : null}
      {phase === "applied" && summary.undoAvailable ? (
        <div className="hammer-polish-result-summary__undo">Undo available</div>
      ) : null}
      {children ? (
        <div className="hammer-polish-result-summary__actions">{children}</div>
      ) : null}
    </section>
  );
}
