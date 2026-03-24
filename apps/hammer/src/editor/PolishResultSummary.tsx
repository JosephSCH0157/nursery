import type { ReactNode } from "react";
import type {
  CleanupSuggestionType,
  HammerCleanupPreview,
} from "./hammerCleanupTools";

export type HammerPolishToolId =
  | "shorten_gaps"
  | "remove_fillers"
  | "remove_retakes"
  | "quick_clean";

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
