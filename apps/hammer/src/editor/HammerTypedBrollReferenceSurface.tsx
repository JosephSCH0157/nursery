import type { JSX } from "react";
import HammerBrollSelectionControls from "./HammerBrollSelectionControls";
import type { HammerBrollToolBayContext, HammerReferenceClipToolBayContext } from "./hammerToolBayContext";

type Context = HammerBrollToolBayContext | HammerReferenceClipToolBayContext;

export function HammerTypedBrollReferenceSurface(props: { context: Context }): JSX.Element {
  const { context } = props;
  const {
    boundAttentionQueue, boundAttentionSummary, placedVisualCount, resolvedBrollBindingItems,
    selectedBoundBrollInspectorState, selectedBoundBrollOperationId, selectedTransitionBoundObject,
    sourceBrollItems, unresolvedBrollSuggestionItems, videoSnapMode,
  } = context.data;
  const {
    addMinimalTransition, discardHearthBrollSuggestion, focusBoundAttentionOperation,
    moveResolvedBrollBinding, navigateBoundAttention, removePlacement: removeVisualPlacement,
    replaceResolvedBrollBinding, resolveHearthBrollSuggestion, revertResolvedBrollBinding,
    setFocusOverride, setTranscriptTimingHint, setVideoSnapMode, trimResolvedBrollBinding,
  } = context.commands;
  const selectedPlacement = context.data.placement;
  return <div data-hammer-tool-bay-surface={context.surface} data-hammer-selected-placement-id={context.data.placementId}>

                  <section className="hammer-tool-card">
                    <HammerBrollSelectionControls placement={selectedPlacement} onRemove={removeVisualPlacement} />
                  <label className="hammer-tool-field">
                    <span>Snap Mode</span>
                    <select
                      value={videoSnapMode}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setVideoSnapMode(event.target.value as "timeline" | "segment");
                      }}
                    >
                      <option value="timeline">Timeline grid</option>
                      <option value="segment">Segment boundaries</option>
                    </select>
                  </label>
                  <div className="hammer-tool-hint">Placed visuals: {placedVisualCount}</div>
                  <div className="hammer-tool-hint">
                    Resolved bindings: {resolvedBrollBindingItems.length} · unresolved suggestions: {unresolvedBrollSuggestionItems.length}
                  </div>
                  <div className="hammer-tool-hint">
                    Needs review: {boundAttentionSummary.total}
                    {` (unresolved ${boundAttentionSummary.unresolvedCount}, degraded ${boundAttentionSummary.degradedCount}, superseded ${boundAttentionSummary.supersededCount}, transitions ${boundAttentionSummary.transitionCount})`}
                  </div>
                  <div className="hammer-source-card__actions">
                    <button type="button" onClick={() => addMinimalTransition("hard_cut")}>Add Hard Cut</button>
                    <button type="button" onClick={() => addMinimalTransition("crossfade")}>Add Crossfade</button>
                    <button type="button" onClick={() => addMinimalTransition("dip_to_black")}>Add Dip To Black</button>
                    <button type="button" onClick={() => addMinimalTransition("fade_audio")}>Add Fade Audio</button>
                  </div>
                  <div className="hammer-source-card__actions">
                    <button
                      type="button"
                      onClick={() => navigateBoundAttention("previous")}
                      disabled={boundAttentionQueue.length === 0}
                    >
                      Previous Attention
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateBoundAttention("next")}
                      disabled={boundAttentionQueue.length === 0}
                    >
                      Next Attention
                    </button>
                  </div>
                  {boundAttentionQueue.length > 0 ? (
                    <div className="hammer-source-list">
                      {boundAttentionQueue.slice(0, 5).map((item) => (
                        <article key={`attention:${item.operationId}`} className={selectedBoundBrollOperationId === item.operationId ? "hammer-source-card is-selected" : "hammer-source-card"}>
                          <header className="hammer-source-card__head">
                            <strong>{item.label}</strong>
                            <span>{item.kind.replace(/_/g, " ")}</span>
                          </header>
                          <div className="hammer-source-card__meta">
                            <span>{item.reasons.join(" ")}</span>
                          </div>
                          <div className="hammer-source-card__actions">
                            <button
                              type="button"
                              onClick={() => focusBoundAttentionOperation(item.operationId)}
                            >
                              Open In Inspector
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : null}
                  {selectedBoundBrollInspectorState ? (
                    <section className="hammer-cleanup-tool">
                      <div className="hammer-cleanup-tool__head">
                        <strong>Bound Object Inspector</strong>
                        <span>{selectedBoundBrollInspectorState.operationId}</span>
                      </div>
                      <div className="hammer-tool-hint">
                        Intent: {selectedBoundBrollInspectorState.intentSource}
                        {selectedBoundBrollInspectorState.intentDescription
                          ? ` · ${selectedBoundBrollInspectorState.intentDescription}`
                          : ""}
                      </div>
                      <div className="hammer-tool-hint">
                        Binding: {selectedBoundBrollInspectorState.bindingState} · lifecycle: {selectedBoundBrollInspectorState.lifecycle}
                      </div>
                      <div className="hammer-tool-hint">
                        Window: {selectedBoundBrollInspectorState.startSec.toFixed(1)}s - {selectedBoundBrollInspectorState.endSec.toFixed(1)}s
                      </div>
                      <div className="hammer-tool-hint">Asset: {selectedBoundBrollInspectorState.assetRef}</div>
                      <div className="hammer-tool-hint">
                        Posture: preview {selectedBoundBrollInspectorState.previewPosture}
                        {` · export ${selectedBoundBrollInspectorState.exportPosture} · handoff ${selectedBoundBrollInspectorState.handoffPosture}`}
                      </div>
                      {selectedBoundBrollInspectorState.linkedDuck ? (
                        <div className="hammer-tool-hint">
                          Linked duck {selectedBoundBrollInspectorState.linkedDuck.operationId}
                          {`: ${selectedBoundBrollInspectorState.linkedDuck.startSec.toFixed(1)}s - ${selectedBoundBrollInspectorState.linkedDuck.endSec.toFixed(1)}s`}
                          {` · aligned ${selectedBoundBrollInspectorState.linkedDuck.aligned ? "yes" : "no"}`}
                          {` · ${selectedBoundBrollInspectorState.linkedDuck.capability}`}
                        </div>
                      ) : (
                        <div className="hammer-tool-hint">Linked duck: none</div>
                      )}
                      {selectedBoundBrollInspectorState.needsAttention ? (
                        <div className="hammer-tool-hint">
                          Attention: {selectedBoundBrollInspectorState.attentionFlags.join(" ")}
                        </div>
                      ) : (
                        <div className="hammer-tool-hint">Attention: none</div>
                      )}
                      {selectedBoundBrollInspectorState.bindingState === "resolved"
                        && selectedBoundBrollInspectorState.lifecycle === "active" ? (
                        <div className="hammer-source-card__actions">
                          <button
                            type="button"
                            onClick={() => moveResolvedBrollBinding(selectedBoundBrollInspectorState.operationId, -0.5)}
                          >
                            Move -0.5s
                          </button>
                          <button
                            type="button"
                            onClick={() => moveResolvedBrollBinding(selectedBoundBrollInspectorState.operationId, 0.5)}
                          >
                            Move +0.5s
                          </button>
                          <button
                            type="button"
                            onClick={() => trimResolvedBrollBinding(selectedBoundBrollInspectorState.operationId, "start", 0.25)}
                          >
                            Trim In +0.25s
                          </button>
                          <button
                            type="button"
                            onClick={() => trimResolvedBrollBinding(selectedBoundBrollInspectorState.operationId, "end", -0.25)}
                          >
                            Trim Out -0.25s
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const replacement = sourceBrollItems.find(
                                (item) => item.assetPath && item.assetPath !== selectedBoundBrollInspectorState.assetRef,
                              )?.assetPath ?? null;
                              if (!replacement) {
                                setTranscriptTimingHint("Upload another b-roll asset before replacing this binding.");
                                return;
                              }
                              replaceResolvedBrollBinding(selectedBoundBrollInspectorState.operationId, replacement);
                            }}
                          >
                            Replace Asset
                          </button>
                          <button
                            type="button"
                            onClick={() => revertResolvedBrollBinding(selectedBoundBrollInspectorState.operationId)}
                          >
                            Revert Binding
                          </button>
                        </div>
                      ) : null}
                      {selectedBoundBrollInspectorState.bindingState === "unresolved"
                        && selectedBoundBrollInspectorState.lifecycle === "active" ? (
                        <div className="hammer-source-card__actions">
                          <button
                            type="button"
                            onClick={() => {
                              const candidate = sourceBrollItems.find((item) => item.assetPath)?.assetPath ?? null;
                              if (!candidate) {
                                setTranscriptTimingHint("Upload B-roll before resolving this suggestion.");
                                return;
                              }
                              resolveHearthBrollSuggestion({
                                operationId: selectedBoundBrollInspectorState.operationId,
                                assetPath: candidate,
                                label: "Resolved from inspector",
                              });
                            }}
                          >
                            Resolve With First Asset
                          </button>
                          <button
                            type="button"
                            onClick={() => discardHearthBrollSuggestion(selectedBoundBrollInspectorState.operationId)}
                          >
                            Discard Suggestion
                          </button>
                        </div>
                      ) : null}
                    </section>
                  ) : selectedTransitionBoundObject ? (
                    <section className="hammer-cleanup-tool">
                      <div className="hammer-cleanup-tool__head">
                        <strong>Transition Inspector</strong>
                        <span>{selectedTransitionBoundObject.object_id}</span>
                      </div>
                      <div className="hammer-tool-hint">
                        Type: {selectedTransitionBoundObject.payload.transition_kind}
                      </div>
                      <div className="hammer-tool-hint">
                        Window: {selectedTransitionBoundObject.placement_window.start_sec.toFixed(1)}s - {selectedTransitionBoundObject.placement_window.end_sec.toFixed(1)}s
                      </div>
                      <div className="hammer-tool-hint">
                        Posture: preview {selectedTransitionBoundObject.posture.preview}
                        {` · export ${selectedTransitionBoundObject.posture.export} · handoff ${selectedTransitionBoundObject.posture.handoff}`}
                      </div>
                      <div className="hammer-tool-hint">
                        Attention: {selectedTransitionBoundObject.attention_flags.length > 0
                          ? selectedTransitionBoundObject.attention_flags.join(", ")
                          : "none"}
                      </div>
                    </section>
                  ) : (
                    <div className="hammer-tool-hint">
                      Select a bound object from the queue or Source Desk to inspect canonical linkage and attention state.
                    </div>
                  )}
                </section>
  </div>;
}
