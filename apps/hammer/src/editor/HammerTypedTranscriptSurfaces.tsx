import type { JSX } from "react";
import PolishResultSummary from "./PolishResultSummary";
import type { HammerCleanupCandidateCard } from "./hammerCleanupCandidateQueue";
import type { FillerCleanupOptions, RetakeCleanupOptions, SpeakerInterviewOptions, SpeakerPanelOptions } from "./hammerCleanupTools";
import type { HammerGapPacingToolBayContext, HammerRetakesToolBayContext, HammerTranscriptCleanupToolBayContext, HammerTranscriptPolishToolBayContext } from "./hammerToolBayContext";

type TranscriptSurfaceContext = HammerTranscriptCleanupToolBayContext | HammerRetakesToolBayContext | HammerGapPacingToolBayContext | HammerTranscriptPolishToolBayContext;

export function HammerTypedTranscriptSurfaces(props: { context: TranscriptSurfaceContext }): JSX.Element {
  const { surface } = props.context;

  return <div data-hammer-tool-bay-surface={surface}>
                  {surface === "transcript_cleanup" || surface === "retakes" || surface === "gap_pacing" || surface === "transcript_polish" ? (
                    surface !== "transcript_polish" ? (() => {
                      const { hasSilenceSuggestionAnalysis, silenceCutSuggestions, visibleSilenceCutSuggestions, activeReviewKind, fillerCleanupOptions, activeFillerCandidateCard, fillerActiveCandidateIndex, fillerCandidateCards, activeFillerCandidateDiffOps, candidateReceiptByKind, candidateProposedRemovalById, selectedTranscriptRange, fillerDecisionInFlight, retakeCleanupOptions, activeRetakeCandidateCard, retakeActiveCandidateIndex, retakeCandidateCards, retakeDecisionInFlight, deadAirThresholdSec, deadAirApplyInFlight, deadAirAnalysis, silenceSuggestionCount: silenceSuggestionCountForGaps } = props.context.data;
                      const { acceptSilenceCutSuggestion, dismissSilenceCutSuggestion, seekPlayheadToTime, setActiveReviewKind, setActiveTranscriptToolSection, refreshCleanupCandidateQueue, setFillerCleanupOptions, updateCandidateProposedRemoval, handleCandidateDecision, setRetakeCleanupOptions, setDeadAirThresholdSec, analyzeDeadAirClosure, applyDeadAirClosureBatch, setFocusOverride } = props.context.commands;
                      function getCommittedProposedRemovalText(card: HammerCleanupCandidateCard | null): string { if (!card) return ""; return candidateProposedRemovalById[card.id]?.text ?? card.suggestedRemovalText ?? ""; }
                      function getDisplayedProposedRemovalText(card: HammerCleanupCandidateCard | null): string { const committedText = getCommittedProposedRemovalText(card); if (committedText.trim()) return committedText; return selectedTranscriptRange?.text ?? ""; }
                      return (
                      <section className="hammer-tool-card">
                        <header className="hammer-tool-card__head">
                          Transcript Cleanup
                        </header>
                        <div className="hammer-tool-hint">
                          Review filler candidates first, then retake candidates below. Shortcuts: Fillers (1), Retakes (2), Approve (A), Reject (R), Prev/Next (K/J).
                        </div>

                    <div role="group" aria-label="Filler cleanup" onFocusCapture={() => {
                      setActiveReviewKind("fillers");
                      setActiveTranscriptToolSection("fillers");
                    }}>
                      <header className="hammer-cleanup-tool__head">
                        <strong>Filler Cleanup</strong>
                        <span>Intent: Remove filler phrases without rewriting surrounding content.</span>
                      </header>
                      <label className="hammer-tool-field">
                        <span>Aggressiveness</span>
                        <select
                          value={fillerCleanupOptions.aggressiveness}
                          onChange={(event) => setFillerCleanupOptions((current) => ({
                            ...current,
                            aggressiveness: event.target.value as FillerCleanupOptions["aggressiveness"],
                          }))}
                        >
                          <option value="light">Light</option>
                          <option value="medium">Medium</option>
                          <option value="strong">Strong</option>
                        </select>
                      </label>
                      <div className="hammer-candidate-review__actions">
                        <button
                          type="button"
                          aria-label="Refresh filler candidates"
                          onClick={() => {
                            setFocusOverride("tool-focus");
                            refreshCleanupCandidateQueue("fillers");
                          }}
                        >
                          Refresh Fillers
                        </button>
                      </div>
                      {activeFillerCandidateCard ? (
                        <article className={`hammer-candidate-card ${activeReviewKind === "fillers" ? "hammer-candidate-card--active" : ""}`}>
                          <header className="hammer-candidate-card__head">
                            <strong>
                              {fillerActiveCandidateIndex + 1} / {fillerCandidateCards.length}
                            </strong>
                            <span>{activeFillerCandidateCard.primarySegmentId}</span>
                          </header>
                          <p className="hammer-candidate-card__description">{activeFillerCandidateCard.description}</p>
                          <div className="hammer-candidate-card__context">
                            <header>Current</header>
                            <p className="hammer-candidate-diff">
                              {activeFillerCandidateDiffOps ? (() => {
                                const parts: JSX.Element[] = [];
                                let first = true;
                                for (let idx = 0; idx < activeFillerCandidateDiffOps.length; idx += 1) {
                                  const op = activeFillerCandidateDiffOps[idx];
                                  if (op.type === "insert") continue;
                                  const text = op.words.join(" ");
                                  const prefix = first ? "" : " ";
                                  first = false;
                                  const className = op.type === "delete" ? "hammer-candidate-diff__del" : undefined;
                                  parts.push(
                                    <span key={`cur-${idx}`} className={className}>
                                      {prefix}{text}
                                    </span>,
                                  );
                                }
                                return parts;
                              })() : activeFillerCandidateCard.beforeText}
                            </p>
                          </div>
                          <div className="hammer-candidate-card__context">
                            <header>Proposed Removal</header>
                            <p className="hammer-candidate-diff">
                              {getDisplayedProposedRemovalText(activeFillerCandidateCard) || "[no removal selected]"}
                            </p>
                          </div>
                          <div className="hammer-candidate-card__meta">
                            <span>Confidence {Math.round(activeFillerCandidateCard.confidence * 100)}%</span>
                            <span>Est. time saved {activeFillerCandidateCard.timeSavedSec.toFixed(1)}s</span>
                          </div>
                          {candidateReceiptByKind.fillers ? (
                            <div className="hammer-tool-hint">{candidateReceiptByKind.fillers}</div>
                          ) : null}
                          <div className="hammer-candidate-review__actions">
                            <button
                              type="button"
                              disabled={fillerDecisionInFlight || !selectedTranscriptRange}
                              onClick={() => {
                                setFocusOverride("tool-focus");
                                updateCandidateProposedRemoval("fillers");
                              }}
                            >
                              Update Proposed Removal
                            </button>
                            <button
                              type="button"
                              disabled={fillerDecisionInFlight || !getCommittedProposedRemovalText(activeFillerCandidateCard).trim()}
                              onClick={() => {
                                setFocusOverride("tool-focus");
                                handleCandidateDecision("fillers", true);
                              }}
                            >
                              Approve Removal
                            </button>
                            <button
                              type="button"
                              disabled={fillerDecisionInFlight}
                              onClick={() => {
                                setFocusOverride("tool-focus");
                                handleCandidateDecision("fillers", false);
                              }}
                            >
                              Reject
                            </button>
                          </div>
                        </article>
                      ) : (
                        <div className="hammer-tool-hint">No filler candidates detected in this pass.</div>
                      )}
                    </div>

                    <hr className="hammer-divider" />

                    <div role="group" aria-label="Retake review" onFocusCapture={() => {
                      setActiveReviewKind("retakes");
                      setActiveTranscriptToolSection("retakes");
                    }}>
                      <header className="hammer-cleanup-tool__head">
                        <strong>Retake Review</strong>
                        <span>Intent: Detect adjacent restarts and false starts for optional removal.</span>
                      </header>
                      <label className="hammer-tool-field">
                        <span>Detection mode</span>
                        <select
                          value={retakeCleanupOptions.detection}
                          onChange={(event) => setRetakeCleanupOptions((current) => ({
                            ...current,
                            detection: event.target.value as RetakeCleanupOptions["detection"],
                          }))}
                        >
                          <option value="conservative">Conservative</option>
                          <option value="normal">Normal</option>
                          <option value="aggressive">Aggressive</option>
                        </select>
                      </label>
                      <div className="hammer-candidate-review__actions">
                        <button
                          type="button"
                          aria-label="Refresh retake candidates"
                          onClick={() => {
                            setFocusOverride("tool-focus");
                            refreshCleanupCandidateQueue("retakes");
                          }}
                        >
                          Refresh Retakes
                        </button>
                      </div>
                      {activeRetakeCandidateCard ? (
                        <article className={`hammer-candidate-card ${activeReviewKind === "retakes" ? "hammer-candidate-card--active" : ""}`}>
                          <header className="hammer-candidate-card__head">
                            <strong>
                              {retakeActiveCandidateIndex + 1} / {retakeCandidateCards.length}
                            </strong>
                            <span>
                              {(() => {
                                const ids = activeRetakeCandidateCard.segmentIds;
                                if (ids.length <= 1) return ids[0] ?? "?";
                                if (ids.length === 2) return `${ids[0] ?? "?"} → ${ids[1] ?? "?"}`;
                                return `${ids.slice(0, -1).join(", ")} → ${ids[ids.length - 1] ?? "?"}`;
                              })()}
                            </span>
                          </header>
                          <p className="hammer-candidate-card__description">{activeRetakeCandidateCard.description}</p>
                          <div className="hammer-candidate-card__context">
                            <header>Current</header>
                            {activeRetakeCandidateCard.beforeText.split("\n").map((line, idx) => (
                              <p key={`retake-cur-${idx}`} className="hammer-candidate-diff">{line}</p>
                            ))}
                          </div>
                          <div className="hammer-candidate-card__context">
                            <header>Proposed Removal</header>
                            <p className="hammer-candidate-diff">
                              {getDisplayedProposedRemovalText(activeRetakeCandidateCard) || "[no removal selected]"}
                            </p>
                          </div>
                          <div className="hammer-candidate-card__meta">
                            <span>Confidence {Math.round(activeRetakeCandidateCard.confidence * 100)}%</span>
                            <span>Time saved {activeRetakeCandidateCard.timeSavedSec.toFixed(1)}s</span>
                          </div>
                          {candidateReceiptByKind.retakes ? (
                            <div className="hammer-tool-hint">{candidateReceiptByKind.retakes}</div>
                          ) : null}
                          <div className="hammer-candidate-review__actions">
                            <button
                              type="button"
                              disabled={retakeDecisionInFlight || !selectedTranscriptRange}
                              onClick={() => {
                                setFocusOverride("tool-focus");
                                updateCandidateProposedRemoval("retakes");
                              }}
                            >
                              Update Proposed Removal
                            </button>
                            <button
                              type="button"
                              disabled={retakeDecisionInFlight || !getCommittedProposedRemovalText(activeRetakeCandidateCard).trim()}
                              onClick={() => {
                                setFocusOverride("tool-focus");
                                handleCandidateDecision("retakes", true);
                              }}
                            >
                              Approve Removal
                            </button>
                            <button
                              type="button"
                              disabled={retakeDecisionInFlight}
                              onClick={() => {
                                setFocusOverride("tool-focus");
                                handleCandidateDecision("retakes", false);
                              }}
                            >
                              Reject
                            </button>
                          </div>
                        </article>
                      ) : (
                        <div className="hammer-tool-hint">No retake candidates detected in this pass.</div>
                      )}
                    </div>

                    <hr className="hammer-divider" />

                    <div
                      role="group"
                      aria-label="Silence gap cleanup"
                      onFocusCapture={() => setActiveTranscriptToolSection("silence_gaps")}
                    >
                      <header className="hammer-cleanup-tool__head">
                        <strong>Silence Gaps</strong>
                        <span>Intent: Trim long silent pauses between spoken segments without changing transcript wording.</span>
                      </header>
                      <div className="hammer-tool-hint">
                        Shortcuts: Focus (Shift+D), Analyze (Shift+A), Apply (Enter).
                      </div>
                      <label className="hammer-tool-field">
                        <span>Max allowed gap</span>
                        <select
                          value={deadAirThresholdSec}
                          onChange={(event) => {
                            setFocusOverride("tool-focus");
                            setDeadAirThresholdSec(Number(event.target.value) || 1.5);
                          }}
                        >
                          <option value={1.0}>1.0s</option>
                          <option value={1.5}>1.5s</option>
                          <option value={2.0}>2.0s</option>
                        </select>
                      </label>
                      <div className="hammer-candidate-review__actions">
                        <button
                          type="button"
                          onClick={() => {
                            setFocusOverride("tool-focus");
                            analyzeDeadAirClosure();
                          }}
                        >
                          Analyze
                        </button>
                        <button
                          type="button"
                          disabled={
                            deadAirApplyInFlight
                            || !deadAirAnalysis
                            || deadAirAnalysis.eligibleGapCount === 0
                          }
                          onClick={() => {
                            setFocusOverride("tool-focus");
                            applyDeadAirClosureBatch();
                          }}
                        >
                          Apply
                        </button>
                      </div>
                      <div className="hammer-tool-hint">
                        {!deadAirAnalysis
                          ? "Analyze to preview how many gaps exceed the selected threshold."
                          : deadAirAnalysis.eligibleGapCount === 0
                            ? "No silence gaps exceed the selected threshold."
                            : `${deadAirAnalysis.eligibleGapCount} gap${deadAirAnalysis.eligibleGapCount === 1 ? "" : "s"} exceed ${deadAirAnalysis.thresholdSec.toFixed(1)}s; applying would remove ${deadAirAnalysis.totalRemovableSec.toFixed(1)}s of silence.`}
                      </div>

                      {hasSilenceSuggestionAnalysis ? (
                        <details className="hammer-timeline-suggestion-list" open>
                          <summary className="hammer-timeline-suggestion-list__meta">
                            <span>
                              Suggested silence cuts: {silenceSuggestionCountForGaps} visible
                              {` · ${(silenceCutSuggestions?.length ?? 0)} total from segmentation`}
                            </span>
                            <span>Accept creates a real cut. Dismiss hides it for this session.</span>
                          </summary>
                          {visibleSilenceCutSuggestions.length > 0 ? (
                            <div className="hammer-timeline-suggestion-list__items">
                              {visibleSilenceCutSuggestions.map((suggestion) => (
                                <article key={suggestion.id} className="hammer-timeline-suggestion-card">
                                  <div className="hammer-timeline-suggestion-card__copy">
                                    <strong>
                                      Cut silence {suggestion.startSec.toFixed(1)}s-{suggestion.endSec.toFixed(1)}s
                                    </strong>
                                    <span>
                                      {suggestion.durationSec.toFixed(1)}s pause · {suggestion.reason === "long_silence" ? "long silence" : suggestion.reason}
                                    </span>
                                  </div>
                                  <div className="hammer-timeline-suggestion-card__actions">
                                    {typeof seekPlayheadToTime === "function" ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setFocusOverride("time-focus");
                                          seekPlayheadToTime(suggestion.startSec, "timeline", { snapToBoundary: true });
                                        }}
                                      >
                                        Jump
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setFocusOverride("tool-focus");
                                        acceptSilenceCutSuggestion(suggestion.id);
                                      }}
                                    >
                                      Accept
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setFocusOverride("tool-focus");
                                        dismissSilenceCutSuggestion(suggestion.id);
                                      }}
                                    >
                                      Dismiss
                                    </button>
                                  </div>
                                </article>
                              ))}
                            </div>
                          ) : (
                            <div className="hammer-timeline-suggestion-list__empty">
                              No long silence suggestions remain above the threshold.
                            </div>
                          )}
                        </details>
                      ) : null}
                    </div>
                  </section>
                      );
                    })() : (() => {
                  const { polishStrength, gapCleanupOptions, fillerCleanupOptions, retakeCleanupOptions, editableTranscriptSegments, speakerSoloOptions, speakerOptions, hasTranscriptSelection, transcriptSelectionRange, speakerInterviewOptions, speakerMonologueOptions, speakerPanelOptions, cleanupPreview, cleanupPreviewSummary, cleanupReceipt } = props.context.data;
                  const { setPolishStrength, setGapCleanupOptions, setCleanupPreview, previewShortenGaps, setFillerCleanupOptions, previewRemoveFillers, setRetakeCleanupOptions, previewRemoveRetakes, previewQuickClean, setSpeakerSoloOptions, previewSpeakerSolo, setSpeakerInterviewOptions, previewSpeakerInterview, setSpeakerMonologueOptions, previewSpeakerMonologue, setSpeakerPanelOptions, previewSpeakerPanel, applyCleanup, setFocusOverride } = props.context.commands;
                  return (
                <section className="hammer-tool-card">
                  <header className="hammer-tool-card__head">
                    Transcript Polish
                  </header>
                  <label className="hammer-tool-field">
                    <span>Cleanup Strength: {polishStrength}%</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={polishStrength}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setPolishStrength(Number(event.target.value));
                      }}
                    />
                  </label>
                  <section className="hammer-cleanup-tool">
                    <div className="hammer-cleanup-tool__head">
                      <strong>Shorten Gaps</strong>
                      <span>
                        Intent: Tighten dead air between adjacent lines without changing spoken words.
                      </span>
                    </div>
                    <label className="hammer-tool-field">
                      <span>Max allowed gap (sec)</span>
                      <input
                        type="number"
                        min={0.1}
                        step={0.05}
                        value={gapCleanupOptions.maxGapSec}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setGapCleanupOptions((current) => ({
                            ...current,
                            maxGapSec: Math.max(0.1, Number(event.target.value) || 0.4),
                          }));
                        }}
                      />
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={gapCleanupOptions.preserveDramaticPauses}
                        onChange={(event) => setGapCleanupOptions((current) => ({
                          ...current,
                          preserveDramaticPauses: event.target.checked,
                        }))}
                      />
                      <span>Preserve dramatic pauses</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("tool-focus");
                        setCleanupPreview(previewShortenGaps(editableTranscriptSegments, gapCleanupOptions));
                      }}
                    >
                      Preview Changes
                    </button>
                  </section>

                  <section className="hammer-cleanup-tool">
                    <div className="hammer-cleanup-tool__head">
                      <strong>Remove Fillers</strong>
                      <span>
                        Intent: Remove filler phrases such as uh, um, you know, and like without rewriting surrounding content.
                      </span>
                    </div>
                    <label className="hammer-tool-field">
                      <span>Aggressiveness</span>
                      <select
                        value={fillerCleanupOptions.aggressiveness}
                        onChange={(event) => setFillerCleanupOptions((current) => ({
                          ...current,
                          aggressiveness: event.target.value as FillerCleanupOptions["aggressiveness"],
                        }))}
                      >
                        <option value="light">Light</option>
                        <option value="medium">Medium</option>
                        <option value="strong">Strong</option>
                      </select>
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={fillerCleanupOptions.protectIntentionalPhrasing}
                        onChange={(event) => setFillerCleanupOptions((current) => ({
                          ...current,
                          protectIntentionalPhrasing: event.target.checked,
                        }))}
                      />
                      <span>Protect intentional phrasing</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("tool-focus");
                        setCleanupPreview(previewRemoveFillers(editableTranscriptSegments, fillerCleanupOptions));
                      }}
                    >
                      Preview Changes
                    </button>
                  </section>

                  <section className="hammer-cleanup-tool">
                    <div className="hammer-cleanup-tool__head">
                      <strong>Remove Retakes</strong>
                      <span>
                        Intent: Remove explicit retake lines or adjacent repeated takes using deterministic overlap rules.
                      </span>
                    </div>
                    <label className="hammer-tool-field">
                      <span>Detection mode</span>
                      <select
                        value={retakeCleanupOptions.detection}
                        onChange={(event) => setRetakeCleanupOptions((current) => ({
                          ...current,
                          detection: event.target.value as RetakeCleanupOptions["detection"],
                        }))}
                      >
                        <option value="conservative">Conservative</option>
                        <option value="normal">Normal</option>
                        <option value="aggressive">Aggressive</option>
                      </select>
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={retakeCleanupOptions.preferLaterCleanerTake}
                        onChange={(event) => setRetakeCleanupOptions((current) => ({
                          ...current,
                          preferLaterCleanerTake: event.target.checked,
                        }))}
                      />
                      <span>Prefer later cleaner take</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("tool-focus");
                        setCleanupPreview(previewRemoveRetakes(editableTranscriptSegments, retakeCleanupOptions));
                      }}
                    >
                      Preview Changes
                    </button>
                  </section>

                  <section className="hammer-cleanup-tool">
                    <div className="hammer-cleanup-tool__head">
                      <strong>Solo Mode</strong>
                      <span>
                        Intent: Keep one speaker in focus while suppressing non-target voices for rapid monologue-style review.
                      </span>
                    </div>
                    <label className="hammer-tool-field">
                      <span>Target speaker</span>
                      <select
                        value={speakerSoloOptions.targetSpeaker}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerSoloOptions((current) => ({
                            ...current,
                            targetSpeaker: event.target.value,
                          }));
                        }}
                        disabled={speakerOptions.length === 0}
                      >
                        {speakerOptions.length > 0 ? speakerOptions.map((speaker) => (
                          <option key={`solo-speaker-${speaker}`} value={speaker}>{speaker}</option>
                        )) : (
                          <option value="">No speakers</option>
                        )}
                      </select>
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={speakerSoloOptions.collapseInterruptions}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerSoloOptions((current) => ({
                            ...current,
                            collapseInterruptions: event.target.checked,
                          }));
                        }}
                      />
                      <span>Collapse short interruptions</span>
                    </label>
                    <label className="hammer-tool-field">
                      <span>Interruption max (sec)</span>
                      <input
                        type="number"
                        min={0.2}
                        max={5}
                        step={0.1}
                        value={speakerSoloOptions.maxInterruptionSec}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerSoloOptions((current) => ({
                            ...current,
                            maxInterruptionSec: Math.max(0.2, Number(event.target.value) || 0.8),
                          }));
                        }}
                        disabled={!speakerSoloOptions.collapseInterruptions}
                      />
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={speakerSoloOptions.compressGaps}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerSoloOptions((current) => ({
                            ...current,
                            compressGaps: event.target.checked,
                          }));
                        }}
                      />
                      <span>Compress gaps around suppressed segments</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("tool-focus");
                        setCleanupPreview(previewSpeakerSolo({
                          segments: editableTranscriptSegments,
                          options: speakerSoloOptions,
                          segmentIds: hasTranscriptSelection ? transcriptSelectionRange.segmentIds : undefined,
                        }));
                      }}
                      disabled={!speakerSoloOptions.targetSpeaker}
                    >
                      Preview Solo Mode
                    </button>
                  </section>

                  <section className="hammer-cleanup-tool">
                    <div className="hammer-cleanup-tool__head">
                      <strong>Interview Mode</strong>
                      <span>
                        Intent: Keep interviewer prompts intact while tightening respondent answers into a cleaner conversational cut.
                      </span>
                    </div>
                    <label className="hammer-tool-field">
                      <span>Interviewer speaker</span>
                      <select
                        value={speakerInterviewOptions.hostSpeaker}
                        onChange={(event) => {
                          const hostSpeaker = event.target.value;
                          setFocusOverride("tool-focus");
                          setSpeakerInterviewOptions((current) => ({
                            ...current,
                            hostSpeaker,
                            respondentSpeaker: current.respondentSpeaker === hostSpeaker
                              ? (speakerOptions.find((speaker) => speaker !== hostSpeaker) ?? hostSpeaker)
                              : current.respondentSpeaker,
                          }));
                        }}
                        disabled={speakerOptions.length === 0}
                      >
                        {speakerOptions.length > 0 ? speakerOptions.map((speaker) => (
                          <option key={`interview-host-${speaker}`} value={speaker}>{speaker}</option>
                        )) : (
                          <option value="">No speakers</option>
                        )}
                      </select>
                    </label>
                    <label className="hammer-tool-field">
                      <span>Respondent speaker</span>
                      <select
                        value={speakerInterviewOptions.respondentSpeaker}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerInterviewOptions((current) => ({
                            ...current,
                            respondentSpeaker: event.target.value,
                          }));
                        }}
                        disabled={speakerOptions.length === 0}
                      >
                        {speakerOptions.length > 0 ? speakerOptions.map((speaker) => (
                          <option key={`interview-respondent-${speaker}`} value={speaker}>{speaker}</option>
                        )) : (
                          <option value="">No speakers</option>
                        )}
                      </select>
                    </label>
                    <label className="hammer-tool-field">
                      <span>Tightness</span>
                      <select
                        value={speakerInterviewOptions.tightness}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerInterviewOptions((current) => ({
                            ...current,
                            tightness: event.target.value as SpeakerInterviewOptions["tightness"],
                          }));
                        }}
                      >
                        <option value="light">Light</option>
                        <option value="medium">Medium</option>
                        <option value="tight">Tight</option>
                      </select>
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={speakerInterviewOptions.removeBackchannels}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerInterviewOptions((current) => ({
                            ...current,
                            removeBackchannels: event.target.checked,
                          }));
                        }}
                      />
                      <span>Remove short backchannels</span>
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={speakerInterviewOptions.collapseInterruptions}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerInterviewOptions((current) => ({
                            ...current,
                            collapseInterruptions: event.target.checked,
                          }));
                        }}
                      />
                      <span>Suppress non-flow interruptions</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("tool-focus");
                        setCleanupPreview(previewSpeakerInterview({
                          segments: editableTranscriptSegments,
                          options: speakerInterviewOptions,
                          segmentIds: hasTranscriptSelection ? transcriptSelectionRange.segmentIds : undefined,
                        }));
                      }}
                      disabled={!speakerInterviewOptions.hostSpeaker || !speakerInterviewOptions.respondentSpeaker}
                    >
                      Preview Interview Mode
                    </button>
                  </section>

                  <section className="hammer-cleanup-tool">
                    <div className="hammer-cleanup-tool__head">
                      <strong>Monologue Cleanup</strong>
                      <span>
                        Intent: Keep one speaker's through-line readable by suppressing brief outside interruptions and tightening filler-heavy target runs.
                      </span>
                    </div>
                    <label className="hammer-tool-field">
                      <span>Target speaker</span>
                      <select
                        value={speakerMonologueOptions.targetSpeaker}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerMonologueOptions((current) => ({
                            ...current,
                            targetSpeaker: event.target.value,
                          }));
                        }}
                        disabled={speakerOptions.length === 0}
                      >
                        {speakerOptions.length > 0 ? speakerOptions.map((speaker) => (
                          <option key={`monologue-speaker-${speaker}`} value={speaker}>{speaker}</option>
                        )) : (
                          <option value="">No speakers</option>
                        )}
                      </select>
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={speakerMonologueOptions.removeBackchannels}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerMonologueOptions((current) => ({
                            ...current,
                            removeBackchannels: event.target.checked,
                          }));
                        }}
                      />
                      <span>Remove short backchannels from others</span>
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={speakerMonologueOptions.suppressInterruptions}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerMonologueOptions((current) => ({
                            ...current,
                            suppressInterruptions: event.target.checked,
                          }));
                        }}
                      />
                      <span>Suppress short interruptions</span>
                    </label>
                    <label className="hammer-tool-field">
                      <span>Interruption max (sec)</span>
                      <input
                        type="number"
                        min={0.2}
                        max={5}
                        step={0.1}
                        value={speakerMonologueOptions.maxInterruptionSec}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerMonologueOptions((current) => ({
                            ...current,
                            maxInterruptionSec: Math.max(0.2, Number(event.target.value) || 0.8),
                          }));
                        }}
                        disabled={!speakerMonologueOptions.suppressInterruptions}
                      />
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={speakerMonologueOptions.tightenTargetRuns}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerMonologueOptions((current) => ({
                            ...current,
                            tightenTargetRuns: event.target.checked,
                          }));
                        }}
                      />
                      <span>Tighten filler-heavy target runs</span>
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={speakerMonologueOptions.compressGaps}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerMonologueOptions((current) => ({
                            ...current,
                            compressGaps: event.target.checked,
                          }));
                        }}
                      />
                      <span>Compress gaps after suppressed interruptions</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("tool-focus");
                        setCleanupPreview(previewSpeakerMonologue({
                          segments: editableTranscriptSegments,
                          options: speakerMonologueOptions,
                          segmentIds: hasTranscriptSelection ? transcriptSelectionRange.segmentIds : undefined,
                        }));
                      }}
                      disabled={!speakerMonologueOptions.targetSpeaker}
                    >
                      Preview Monologue Cleanup
                    </button>
                  </section>

                  <section className="hammer-cleanup-tool">
                    <div className="hammer-cleanup-tool__head">
                      <strong>Panel Mode</strong>
                      <span>
                        Intent: Keep multi-speaker panel flow readable by suppressing low-signal backchannels and short cross-talk without rewriting speaker structure.
                      </span>
                    </div>
                    <label className="hammer-tool-field">
                      <span>Host / moderator speaker</span>
                      <select
                        value={speakerPanelOptions.hostSpeaker}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerPanelOptions((current) => ({
                            ...current,
                            hostSpeaker: event.target.value,
                          }));
                        }}
                        disabled={speakerOptions.length === 0}
                      >
                        {speakerOptions.length > 0 ? speakerOptions.map((speaker) => (
                          <option key={`panel-host-${speaker}`} value={speaker}>{speaker}</option>
                        )) : (
                          <option value="">No speakers</option>
                        )}
                      </select>
                    </label>
                    <label className="hammer-tool-field">
                      <span>Primary speaker bias</span>
                      <select
                        value={speakerPanelOptions.primarySpeakerBias}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerPanelOptions((current) => ({
                            ...current,
                            primarySpeakerBias: event.target.value as SpeakerPanelOptions["primarySpeakerBias"],
                          }));
                        }}
                      >
                        <option value="none">None</option>
                        <option value="balanced">Balanced</option>
                        <option value="host_favoring">Host favoring</option>
                      </select>
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={speakerPanelOptions.removeShortBackchannels}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerPanelOptions((current) => ({
                            ...current,
                            removeShortBackchannels: event.target.checked,
                          }));
                        }}
                      />
                      <span>Remove short backchannels</span>
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={speakerPanelOptions.suppressShortCrossTalk}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerPanelOptions((current) => ({
                            ...current,
                            suppressShortCrossTalk: event.target.checked,
                          }));
                        }}
                      />
                      <span>Suppress short cross-talk interruptions</span>
                    </label>
                    <label className="hammer-tool-field">
                      <span>Max interruption (sec)</span>
                      <input
                        type="number"
                        min={0.2}
                        max={5}
                        step={0.1}
                        value={speakerPanelOptions.maxInterruptionSec}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerPanelOptions((current) => ({
                            ...current,
                            maxInterruptionSec: Math.max(0.2, Number(event.target.value) || 0.8),
                          }));
                        }}
                        disabled={!speakerPanelOptions.suppressShortCrossTalk}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("tool-focus");
                        setCleanupPreview(previewSpeakerPanel({
                          segments: editableTranscriptSegments,
                          options: speakerPanelOptions,
                          segmentIds: hasTranscriptSelection ? transcriptSelectionRange.segmentIds : undefined,
                        }));
                      }}
                      disabled={!speakerPanelOptions.hostSpeaker}
                    >
                      Preview Panel Mode
                    </button>
                  </section>

                  <section className="hammer-cleanup-tool hammer-cleanup-tool--quick">
                    <div className="hammer-cleanup-tool__head">
                      <strong>Quick Clean</strong>
                      <span>
                        Intent: Run deterministic polish in order: Remove Retakes {"->"} Remove Fillers {"->"} Shorten Gaps.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("tool-focus");
                        setCleanupPreview(previewQuickClean({
                          segments: editableTranscriptSegments,
                          retakes: retakeCleanupOptions,
                          fillers: fillerCleanupOptions,
                          gaps: gapCleanupOptions,
                        }));
                      }}
                    >
                      Preview Quick Clean
                    </button>
                  </section>

                  {cleanupPreview && cleanupPreviewSummary ? (
                    <PolishResultSummary phase="preview" summary={cleanupPreviewSummary}>
                      {cleanupPreview.metadata?.tightenSelection ? (
                        <section className="hammer-tighten-preview" aria-label="Meaning-preserving tighten preview">
                          <div className="hammer-tighten-preview__intent">
                            <strong>Intent</strong>
                            <span>{cleanupPreview.metadata.tightenSelection.intent}</span>
                          </div>
                          <div className="hammer-tighten-preview__meta">
                            <span>Removed fillers: {cleanupPreview.metadata.tightenSelection.removedFillers}</span>
                            <span>Collapsed repetitions: {cleanupPreview.metadata.tightenSelection.collapsedRepetitions}</span>
                            <span>Merged fragments: {cleanupPreview.metadata.tightenSelection.mergedFragments}</span>
                            <span>Estimated time saved: {cleanupPreview.summary.timeSavedSec.toFixed(1)} s</span>
                            <span>
                              Confidence: {cleanupPreview.metadata.tightenSelection.confidenceLabel}
                              {" "}
                              ({Math.round(cleanupPreview.metadata.tightenSelection.confidenceScore * 100)}%)
                            </span>
                          </div>
                          <div className="hammer-tighten-preview__text-grid">
                            <article className="hammer-tighten-preview__pane">
                              <header>Before</header>
                              <p>{cleanupPreview.metadata.tightenSelection.beforeText || "No source text in selection."}</p>
                            </article>
                            <article className="hammer-tighten-preview__pane">
                              <header>After</header>
                              <p>{cleanupPreview.metadata.tightenSelection.afterText || "No tightened text proposed."}</p>
                            </article>
                          </div>
                          <div className="hammer-tighten-preview__safety">
                            {cleanupPreview.metadata.tightenSelection.safetyNote}
                          </div>
                        </section>
                      ) : null}
                      {cleanupPreview.metadata?.speakerSolo ? (
                        <section className="hammer-tighten-preview" aria-label="Solo mode preview">
                          <div className="hammer-tighten-preview__intent">
                            <strong>Intent</strong>
                            <span>{cleanupPreview.metadata.speakerSolo.intent}</span>
                          </div>
                          <div className="hammer-tighten-preview__meta">
                            <span>Target speaker: {cleanupPreview.metadata.speakerSolo.targetSpeaker}</span>
                            <span>Scope: {cleanupPreview.metadata.speakerSolo.scopeLabel}</span>
                            <span>Suppressed segments: {cleanupPreview.metadata.speakerSolo.suppressedSegments}</span>
                            <span>Collapsed interruptions: {cleanupPreview.metadata.speakerSolo.collapsedInterruptions}</span>
                            <span>Estimated time saved: {cleanupPreview.metadata.speakerSolo.estimatedDurationSavedSec.toFixed(1)} s</span>
                            <span>
                              Confidence: {cleanupPreview.metadata.speakerSolo.confidenceLabel}
                              {" "}
                              ({Math.round(cleanupPreview.metadata.speakerSolo.confidenceScore * 100)}%)
                            </span>
                          </div>
                          <div className="hammer-tighten-preview__safety">
                            {cleanupPreview.metadata.speakerSolo.safetyNote}
                          </div>
                        </section>
                      ) : null}
                      {cleanupPreview.metadata?.speakerInterview ? (
                        <section className="hammer-tighten-preview" aria-label="Interview mode preview">
                          <div className="hammer-tighten-preview__intent">
                            <strong>Intent</strong>
                            <span>{cleanupPreview.metadata.speakerInterview.intent}</span>
                          </div>
                          <div className="hammer-tighten-preview__meta">
                            <span>Interviewer: {cleanupPreview.metadata.speakerInterview.hostSpeaker}</span>
                            <span>Respondent: {cleanupPreview.metadata.speakerInterview.respondentSpeaker}</span>
                            <span>Prompts kept: {cleanupPreview.metadata.speakerInterview.promptsKept}</span>
                            <span>Answer segments tightened: {cleanupPreview.metadata.speakerInterview.answerSegmentsTightened}</span>
                            <span>Fillers removed: {cleanupPreview.metadata.speakerInterview.fillersRemoved}</span>
                            <span>Retakes removed: {cleanupPreview.metadata.speakerInterview.retakesRemoved}</span>
                            <span>Interruptions suppressed: {cleanupPreview.metadata.speakerInterview.interruptionsSuppressed}</span>
                            <span>Estimated time saved: {cleanupPreview.metadata.speakerInterview.estimatedDurationSavedSec.toFixed(1)} s</span>
                            <span>
                              Confidence: {cleanupPreview.metadata.speakerInterview.confidenceLabel}
                              {" "}
                              ({Math.round(cleanupPreview.metadata.speakerInterview.confidenceScore * 100)}%)
                            </span>
                          </div>
                          <div className="hammer-tighten-preview__safety">
                            {cleanupPreview.metadata.speakerInterview.safetyNote}
                          </div>
                        </section>
                      ) : null}
                      {cleanupPreview.metadata?.speakerMonologue ? (
                        <section className="hammer-tighten-preview" aria-label="Monologue cleanup preview">
                          <div className="hammer-tighten-preview__intent">
                            <strong>Intent</strong>
                            <span>{cleanupPreview.metadata.speakerMonologue.intent}</span>
                          </div>
                          <div className="hammer-tighten-preview__meta">
                            <span>Target speaker: {cleanupPreview.metadata.speakerMonologue.targetSpeaker}</span>
                            <span>Backchannels removed: {cleanupPreview.metadata.speakerMonologue.backchannelsRemoved}</span>
                            <span>Interruptions suppressed: {cleanupPreview.metadata.speakerMonologue.interruptionsSuppressed}</span>
                            <span>Same-speaker runs tightened: {cleanupPreview.metadata.speakerMonologue.sameSpeakerRunsTightened}</span>
                            <span>Estimated time saved: {cleanupPreview.metadata.speakerMonologue.estimatedDurationSavedSec.toFixed(1)} s</span>
                            <span>
                              Confidence: {cleanupPreview.metadata.speakerMonologue.confidenceLabel}
                              {" "}
                              ({Math.round(cleanupPreview.metadata.speakerMonologue.confidenceScore * 100)}%)
                            </span>
                          </div>
                          <div className="hammer-tighten-preview__safety">
                            {cleanupPreview.metadata.speakerMonologue.safetyNote}
                          </div>
                        </section>
                      ) : null}
                      {cleanupPreview.metadata?.speakerPanel ? (
                        <section className="hammer-tighten-preview" aria-label="Panel mode preview">
                          <div className="hammer-tighten-preview__intent">
                            <strong>Intent</strong>
                            <span>{cleanupPreview.metadata.speakerPanel.intent}</span>
                          </div>
                          <div className="hammer-tighten-preview__meta">
                            <span>Participant scope: {cleanupPreview.metadata.speakerPanel.participantScope}</span>
                            <span>Host/moderator: {cleanupPreview.metadata.speakerPanel.hostSpeaker}</span>
                            <span>Bias: {cleanupPreview.metadata.speakerPanel.primarySpeakerBias.replace(/_/g, " ")}</span>
                            <span>Backchannels removed: {cleanupPreview.metadata.speakerPanel.backchannelsRemoved}</span>
                            <span>Cross-talk suppressed: {cleanupPreview.metadata.speakerPanel.crossTalkSegmentsSuppressed}</span>
                            <span>Turns preserved: {cleanupPreview.metadata.speakerPanel.turnsPreserved}</span>
                            <span>Estimated time saved: {cleanupPreview.metadata.speakerPanel.estimatedDurationSavedSec.toFixed(1)} s</span>
                            <span>
                              Confidence: {cleanupPreview.metadata.speakerPanel.confidenceLabel}
                              {" "}
                              ({Math.round(cleanupPreview.metadata.speakerPanel.confidenceScore * 100)}%)
                            </span>
                          </div>
                          <div className="hammer-tighten-preview__safety">
                            {cleanupPreview.metadata.speakerPanel.safetyNote}
                          </div>
                        </section>
                      ) : null}
                      <button type="button" onClick={() => applyCleanup(cleanupPreview)}>Apply</button>
                      <button type="button" onClick={() => setCleanupPreview(null)}>Discard</button>
                    </PolishResultSummary>
                  ) : null}
                  {cleanupReceipt ? (
                    <PolishResultSummary phase="applied" summary={cleanupReceipt} />
                  ) : null}
                  <div className="hammer-tool-hint">Deterministic cleanup only. No AI inference path.</div>
                </section>
                  );
                })()
              ) : null}
  </div>;
}
