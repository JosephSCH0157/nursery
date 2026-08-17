import { useMemo, useState } from "react";
import { buildCleanupCandidateQueue } from "../editor/hammerCleanupCandidateQueue";
import { previewQuickClean } from "../editor/hammerCleanupTools";
import {
  buildHammerCleanupGoldenFixture,
  hammerCleanupGoldenExpectations,
} from "../../tests/fixtures/hammerCleanupGoldenFixture";
import "./HammerCleanupGoldenFixtureView.css";

type TranscriptRow = {
  segment_id: string;
  text: string;
  start_sec: number;
  end_sec: number;
};

function toTranscriptRows(
  segments: Array<{ segment_id: string; text: string; start_sec: number; end_sec: number }>,
): TranscriptRow[] {
  return segments.map((segment) => ({
    segment_id: segment.segment_id,
    text: segment.text,
    start_sec: segment.start_sec,
    end_sec: segment.end_sec,
  }));
}

function formatSec(value: number): string {
  return `${value.toFixed(2)}s`;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

export default function HammerCleanupGoldenFixtureView() {
  const [loadRevision, setLoadRevision] = useState(0);

  const run = useMemo(() => {
    const fixture = buildHammerCleanupGoldenFixture();
    const quickClean = previewQuickClean({
      segments: fixture.segments,
      retakes: fixture.options.retakes,
      fillers: fixture.options.fillers,
      gaps: fixture.options.gaps,
    });
    const retakeQueue = buildCleanupCandidateQueue({
      kind: "retakes",
      segments: fixture.segments,
      fillerOptions: fixture.options.fillers,
      retakeOptions: fixture.options.retakes,
      handledCandidateIds: new Set<string>(),
    });

    const beforeRows = toTranscriptRows(fixture.segments);
    const afterRows = toTranscriptRows(quickClean.resultSegments);
    const beforeById = new Map(beforeRows.map((row) => [row.segment_id, row] as const));
    const afterById = new Map(afterRows.map((row) => [row.segment_id, row] as const));

    const removedSegmentCount = beforeRows.filter((row) => !afterById.has(row.segment_id)).length;
    const trimmedSegmentCount = afterRows.filter((row) => {
      const original = beforeById.get(row.segment_id);
      return Boolean(original && original.text !== row.text);
    }).length;

    const expectedQuickRows = hammerCleanupGoldenExpectations.quickClean.resultSegments;
    const actualQuickRows = afterRows.map((row) => ({
      segment_id: row.segment_id,
      text: row.text,
      start_sec: row.start_sec,
      end_sec: row.end_sec,
    }));

    const quickSummaryMatches = stableJson(quickClean.summary) === stableJson(hammerCleanupGoldenExpectations.quickClean.summary);
    const quickRowsMatch = stableJson(actualQuickRows) === stableJson(expectedQuickRows);
    const queueCountMatches = retakeQueue.cards.length === hammerCleanupGoldenExpectations.cleanupCandidateQueue.retakeCardCount;
    const queueRemovalTextMatches = stableJson(retakeQueue.cards.map((card) => card.suggestedRemovalText))
      === stableJson(hammerCleanupGoldenExpectations.cleanupCandidateQueue.suggestedRemovalText);
    const queueDescriptionMatches = stableJson(retakeQueue.cards.map((card) => card.description))
      === stableJson(hammerCleanupGoldenExpectations.cleanupCandidateQueue.descriptions);

    return {
      beforeRows,
      afterRows,
      quickClean,
      retakeQueue,
      removedSegmentCount,
      trimmedSegmentCount,
      quickSummaryMatches,
      quickRowsMatch,
      queueCountMatches,
      queueRemovalTextMatches,
      queueDescriptionMatches,
    };
  }, [loadRevision]);

  const quickCheckPass = run.quickSummaryMatches && run.quickRowsMatch;
  const queueCheckPass = run.queueCountMatches && run.queueRemovalTextMatches && run.queueDescriptionMatches;

  return (
    <section className="hammer-cleanup-golden">
      <header className="hammer-cleanup-golden__header">
        <div>
          <h2>Hammer Cleanup Golden Fixture Diff</h2>
          <p>
            Dev-only harness. Deterministic fixture-driven view for editor trust checks after cleanup logic changes.
          </p>
        </div>
        <button
          type="button"
          className="hammer-cleanup-golden__reload"
          onClick={() => setLoadRevision((value) => value + 1)}
        >
          Load Golden Fixture
        </button>
      </header>

      <section className="hammer-cleanup-golden__checks">
        <article className={`hammer-cleanup-golden__check ${quickCheckPass ? "is-pass" : "is-fail"}`}>
          <h3>QuickClean Expectations</h3>
          <p>{quickCheckPass ? "PASS" : "FAIL"}</p>
          <ul>
            <li>Summary match: {run.quickSummaryMatches ? "yes" : "no"}</li>
            <li>Transcript match: {run.quickRowsMatch ? "yes" : "no"}</li>
          </ul>
        </article>
        <article className={`hammer-cleanup-golden__check ${queueCheckPass ? "is-pass" : "is-fail"}`}>
          <h3>CleanupCandidateQueue Expectations</h3>
          <p>{queueCheckPass ? "PASS" : "FAIL"}</p>
          <ul>
            <li>Retake card count: {run.queueCountMatches ? "yes" : "no"}</li>
            <li>suggestedRemovalText: {run.queueRemovalTextMatches ? "yes" : "no"}</li>
            <li>description: {run.queueDescriptionMatches ? "yes" : "no"}</li>
          </ul>
        </article>
      </section>

      <section className="hammer-cleanup-golden__summary">
        <div>
          <span>Removed segments</span>
          <strong>{run.removedSegmentCount}</strong>
        </div>
        <div>
          <span>Trimmed segments</span>
          <strong>{run.trimmedSegmentCount}</strong>
        </div>
        <div>
          <span>Estimated time saved</span>
          <strong>{formatSec(run.quickClean.summary.timeSavedSec)}</strong>
        </div>
      </section>

      <section className="hammer-cleanup-golden__transcript-grid">
        <article className="hammer-cleanup-golden__panel">
          <h3>Before</h3>
          <ol>
            {run.beforeRows.map((row) => (
              <li key={`before:${row.segment_id}`} className="hammer-cleanup-golden__segment">
                <div className="hammer-cleanup-golden__segment-meta">
                  <code>{row.segment_id}</code>
                  <span>{formatSec(row.start_sec)} - {formatSec(row.end_sec)}</span>
                </div>
                <p>{row.text}</p>
              </li>
            ))}
          </ol>
        </article>
        <article className="hammer-cleanup-golden__panel">
          <h3>After</h3>
          <ol>
            {run.afterRows.map((row) => (
              <li key={`after:${row.segment_id}`} className="hammer-cleanup-golden__segment">
                <div className="hammer-cleanup-golden__segment-meta">
                  <code>{row.segment_id}</code>
                  <span>{formatSec(row.start_sec)} - {formatSec(row.end_sec)}</span>
                </div>
                <p>{row.text}</p>
              </li>
            ))}
          </ol>
        </article>
      </section>

      <section className="hammer-cleanup-golden__panel">
        <h3>Retake Candidate Cards</h3>
        {run.retakeQueue.cards.length === 0 ? (
          <p className="hammer-cleanup-golden__empty">No retake cards generated for this fixture.</p>
        ) : (
          <div className="hammer-cleanup-golden__cards">
            {run.retakeQueue.cards.map((card) => (
              <article key={card.id} className="hammer-cleanup-golden__card">
                <header>
                  <code>{card.id}</code>
                  <span>confidence {card.confidence.toFixed(2)}</span>
                </header>
                <div>
                  <h4>Description</h4>
                  <p>{card.description}</p>
                </div>
                <div>
                  <h4>Proposed removal</h4>
                  <pre>{card.suggestedRemovalText || "(none)"}</pre>
                </div>
                <div>
                  <h4>Kept text</h4>
                  <pre>{card.afterText ?? "(segment removed)"}</pre>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
