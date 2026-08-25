import type { JSX } from "react";
import type { HammerImageAnimationToolBayContext, HammerImagePlacementToolBayContext, HammerImageTimingToolBayContext, HammerImageTransformToolBayContext } from "./hammerToolBayContext";
import { clampImagePlacementTransform, DEFAULT_IMAGE_PLACEMENT_TRANSFORM, MIN_IMAGE_PLACEMENT_DURATION_SEC } from "./hammerWorkspaceShellVisualUtils";
import { roundToTenth } from "./hammerWorkspaceTimeline";

export type HammerImageInspectorContext = HammerImagePlacementToolBayContext | HammerImageTimingToolBayContext | HammerImageTransformToolBayContext | HammerImageAnimationToolBayContext;

export function HammerTypedImageInspectorSurface(props: { context: HammerImageInspectorContext }): JSX.Element {
  const surface = props.context.surface;
  const { placement: imagePlacementSnapshot, transform: imagePlacementSnapshotTransform, autoPlacementDebugEnabled, selectedAutoPreviewActive, previewAutoPositionStatus, previewDiagnostics: previewDiagnosticsSummary, episodeHealth: episodeHealthSnapshot, selectedAnchorSegment: selectedVisualAnchorSegment, selectedAnchorSegmentId: selectedVisualAnchorSegmentId, selectedClip: selectedVisualClip, anchorLabelDraft, anchorTextDraft } = props.context.data;
  const { previewAutoPosition, resetPreviewAutoPosition, setAnchorLabelDraft, setAnchorTextDraft, updateTransformDraft: updateImagePlacementTransform, shiftTiming: updateVisualPlacementTiming, commitTransform: commitImagePlacementTransform, commitAnchor: commitVisualAnchorRefinement, commitTiming: commitVisualPlacementWindow, removePlacement: removeVisualPlacement, focus: setFocusOverride } = props.context.commands;
  const selectedPlacementId = imagePlacementSnapshot?.id ?? null;
  const selectedOverlayAssetPresent = Boolean(imagePlacementSnapshot?.assetPath);
  const selectedVisualAssetPresent = Boolean(selectedVisualClip?.asset_id);
  const selectedClipPresent = Boolean(selectedVisualClip?.clip_id);
  const previewAutoPositionDisabledReason = !imagePlacementSnapshot ? "No selected image placement." : !selectedOverlayAssetPresent && !selectedVisualAssetPresent ? "Selected placement has no visual asset." : !previewAutoPosition ? "Automatic placement action unavailable (not wired)." : null;
  const resetPreviewPositionDisabledReason = !imagePlacementSnapshot ? "No selected image placement." : !selectedAutoPreviewActive ? "No active auto preview override." : !resetPreviewAutoPosition ? "Reset action unavailable." : null;
  return <div data-hammer-tool-bay-surface={surface}>
                  <section className="hammer-tool-card">
                    <header className="hammer-tool-card__head">Image Placement</header>
                    {autoPlacementDebugEnabled ? <div className="hammer-dev-auto-preview-controls">
                      <div className="hammer-dev-auto-preview-controls__title">DEV AUTO PREVIEW CONTROLS</div>
                      <div>debug flag enabled: {autoPlacementDebugEnabled ? "yes" : "no"}</div>
                      <div>selected placement id: {selectedPlacementId ?? "none"}</div>
                      <div>selected overlay asset: {selectedOverlayAssetPresent ? "yes" : "no"}</div>
                      <div>selected visual asset: {selectedVisualAssetPresent ? "yes" : "no"}</div>
                      <div>selected clip: {selectedClipPresent ? "yes" : "no"}</div>
                      <div>selected auto preview active: {selectedAutoPreviewActive ? "yes" : "no"}</div>
                      <div>resolved placement exists: {previewDiagnosticsSummary?.resolvedPlacementExists ? "yes" : "no"}</div>
                      <div>diagnostics enabled: {previewDiagnosticsSummary?.diagnosticsEnabled ? "yes" : "no"}</div>
                      <div>diagnostics resolvedPlacement: {previewDiagnosticsSummary?.diagnosticsResolvedPlacement ? "yes" : "no"}</div>
                      <div>candidateCount: {previewDiagnosticsSummary?.candidateCount ?? 0}</div>
                      <div>maskBoundsCount: {previewDiagnosticsSummary?.maskBoundsCount ?? 0}</div>
                      <div>current frame available: {previewDiagnosticsSummary?.currentFrameAvailable ? "yes" : "no"}</div>
                      <div>segmentation mask available: {previewDiagnosticsSummary?.segmentationMaskAvailable ? "yes" : "no"}</div>
                      <div>resolver status: {previewDiagnosticsSummary?.resolverStatus ?? "unknown"}</div>
                      <div>resolver reason: {previewDiagnosticsSummary?.resolverReason ?? "unknown"}</div>
                      <div>selectedScale: {previewDiagnosticsSummary?.selectedScale == null ? "n/a" : previewDiagnosticsSummary.selectedScale.toFixed(2)}</div>
                      {(previewDiagnosticsSummary?.scaleAttempts ?? []).map((attempt, idx) => (
                        <div key={`dev-scale-attempt-${idx}`}>
                          scale {attempt.scale.toFixed(2)} {"->"} candidates {attempt.candidateCount}, rejected {attempt.rejectedCount}, best rejection {attempt.bestRejectionReason ?? "none"}, resolved {attempt.resolved ? "yes" : "no"}
                        </div>
                      ))}
                      <div className="hammer-tool-hint">
                        Episode health snapshot:
                        <pre>{JSON.stringify(episodeHealthSnapshot ?? { missing: true }, null, 2)}</pre>
                      </div>
                      <div className="hammer-source-card__actions">
                        <button
                          type="button"
                          onClick={() => previewAutoPosition?.()}
                          disabled={Boolean(previewAutoPositionDisabledReason)}
                        >
                          Preview Auto Position
                        </button>
                        <button
                          type="button"
                          onClick={() => resetPreviewAutoPosition?.()}
                          disabled={Boolean(resetPreviewPositionDisabledReason)}
                        >
                          Reset Preview Position
                        </button>
                      </div>
                      <div>
                        Preview button: {previewAutoPositionDisabledReason ? `disabled - ${previewAutoPositionDisabledReason}` : "enabled"}
                      </div>
                      <div>
                        Reset button: {resetPreviewPositionDisabledReason ? `disabled - ${resetPreviewPositionDisabledReason}` : "enabled"}
                      </div>
                      {previewDiagnosticsSummary && !previewDiagnosticsSummary.resolvedPlacementExists ? (
                        <div>
                          Plain English: No usable resolver placement yet because {previewDiagnosticsSummary.resolverReason}.
                        </div>
                      ) : null}
                      <div>
                        {selectedAutoPreviewActive ? "AUTO PREVIEW ACTIVE (unsaved)" : "Auto preview inactive"}
                        {previewAutoPositionStatus ? ` · ${previewAutoPositionStatus}` : ""}
                      </div>
                    </div> : null}
                    <div className="hammer-tool-hint">
                      Direct manipulation mode. Drag and resize image clips in timeline or preview. Hold Shift while dragging to snap to 0.1s steps.
                    </div>
                    {imagePlacementSnapshot ? (
                      <>
                        <div className="hammer-tool-hint">
                          Selected: {imagePlacementSnapshot.label}
                          {` (${imagePlacementSnapshot.startSec.toFixed(1)}s - ${imagePlacementSnapshot.endSec.toFixed(1)}s)`}
                        </div>
                        <label className="hammer-tool-field">
                          <span>Start (sec)</span>
                          <input
                            type="number"
                            min={0}
                            step={0.1}
                            value={imagePlacementSnapshot.startSec}
                            onChange={(event) => {
                              const nextStart = Math.max(0, Number(event.target.value) || 0);
                              const minEnd = roundToTenth(nextStart + MIN_IMAGE_PLACEMENT_DURATION_SEC);
                              commitVisualPlacementWindow(imagePlacementSnapshot.id, {
                                startSec: nextStart,
                                endSec: Math.max(minEnd, imagePlacementSnapshot.endSec),
                                label: "Adjust image clip start",
                              });
                            }}
                          />
                        </label>
                        <label className="hammer-tool-field">
                          <span>End (sec)</span>
                          <input
                            type="number"
                            min={0}
                            step={0.1}
                            value={imagePlacementSnapshot.endSec}
                            onChange={(event) => {
                              const nextEnd = Math.max(0, Number(event.target.value) || 0);
                              commitVisualPlacementWindow(imagePlacementSnapshot.id, {
                                startSec: imagePlacementSnapshot.startSec,
                                endSec: Math.max(
                                  roundToTenth(imagePlacementSnapshot.startSec + MIN_IMAGE_PLACEMENT_DURATION_SEC),
                                  nextEnd,
                                ),
                                label: "Adjust image clip end",
                              });
                            }}
                          />
                        </label>
                        <div className="hammer-source-card__actions">
                          <button type="button" onClick={() => updateVisualPlacementTiming(imagePlacementSnapshot.id, -0.5)}>
                            Move -0.5s
                          </button>
                          <button type="button" onClick={() => updateVisualPlacementTiming(imagePlacementSnapshot.id, 0.5)}>
                            Move +0.5s
                          </button>
                          <button type="button" onClick={() => removeVisualPlacement(imagePlacementSnapshot.id)}>
                            Remove Clip
                          </button>
                        </div>
                        <div className="hammer-tool-hint">
                          Anchor segment: {selectedVisualAnchorSegmentId ?? "n/a"}
                          {` · matches ${selectedVisualClip?.anchor_hint.matched_segment_ids.length ?? 0}`}
                          {selectedVisualClip?.anchor_hint.detached ? " · detached" : " · attached"}
                        </div>
                        <label className="hammer-tool-field">
                          <span>Anchor Text</span>
                          <textarea
                            value={anchorTextDraft}
                            rows={3}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setAnchorTextDraft(event.target.value);
                            }}
                          />
                        </label>
                        <label className="hammer-tool-field">
                          <span>Anchor Label</span>
                          <input
                            value={anchorLabelDraft}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setAnchorLabelDraft(event.target.value);
                            }}
                          />
                        </label>
                        <div className="hammer-source-card__actions">
                          <button
                            type="button"
                            onClick={() => previewAutoPosition?.()}
                            disabled={Boolean(previewAutoPositionDisabledReason)}
                          >
                            Apply Auto Position
                          </button>
                          <button
                            type="button"
                            onClick={() => commitVisualAnchorRefinement({
                              clipId: imagePlacementSnapshot.id,
                              anchorText: anchorTextDraft,
                              anchorLabel: anchorLabelDraft,
                              detached: true,
                              label: "Refine visual anchor",
                            })}
                          >
                            Save Anchor
                          </button>
                          <button
                            type="button"
                            onClick={() => commitVisualAnchorRefinement({
                              clipId: imagePlacementSnapshot.id,
                              anchorText: selectedVisualAnchorSegment?.text ?? "",
                              anchorLabel: anchorLabelDraft,
                              detached: false,
                              label: "Reset visual anchor",
                            })}
                            disabled={!selectedVisualAnchorSegment}
                          >
                            Reset to Segment
                          </button>
                        </div>
                        {previewAutoPositionStatus ? <div className="hammer-tool-hint" role="status">{previewAutoPositionStatus}</div> : null}
                        <label className="hammer-tool-field">
                          <span>Position X ({Math.round(imagePlacementSnapshotTransform.leftPct)}%)</span>
                          <input
                            type="range"
                            min={0}
                            max={92}
                            step={1}
                            value={imagePlacementSnapshotTransform.leftPct}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              const updated = clampImagePlacementTransform({
                                ...imagePlacementSnapshotTransform,
                                leftPct: next,
                              });
                              updateImagePlacementTransform(imagePlacementSnapshot.id, () => updated);
                              commitImagePlacementTransform(imagePlacementSnapshot.id, updated, "Adjust visual overlay X");
                            }}
                          />
                        </label>
                        <label className="hammer-tool-field">
                          <span>Position Y ({Math.round(imagePlacementSnapshotTransform.topPct)}%)</span>
                          <input
                            type="range"
                            min={0}
                            max={92}
                            step={1}
                            value={imagePlacementSnapshotTransform.topPct}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              const updated = clampImagePlacementTransform({
                                ...imagePlacementSnapshotTransform,
                                topPct: next,
                              });
                              updateImagePlacementTransform(imagePlacementSnapshot.id, () => updated);
                              commitImagePlacementTransform(imagePlacementSnapshot.id, updated, "Adjust visual overlay Y");
                            }}
                          />
                        </label>
                        <label className="hammer-tool-field">
                          <span>
                            Scale ({Math.round((imagePlacementSnapshotTransform.widthPct / DEFAULT_IMAGE_PLACEMENT_TRANSFORM.widthPct) * 100)}%)
                          </span>
                          <input
                            type="range"
                            min={50}
                            max={200}
                            step={1}
                            value={Math.round((imagePlacementSnapshotTransform.widthPct / DEFAULT_IMAGE_PLACEMENT_TRANSFORM.widthPct) * 100)}
                            onChange={(event) => {
                              const scale = Number(event.target.value) / 100;
                              const updated = clampImagePlacementTransform({
                                ...imagePlacementSnapshotTransform,
                                widthPct: DEFAULT_IMAGE_PLACEMENT_TRANSFORM.widthPct * scale,
                                heightPct: DEFAULT_IMAGE_PLACEMENT_TRANSFORM.heightPct * scale,
                              });
                              updateImagePlacementTransform(imagePlacementSnapshot.id, () => updated);
                              commitImagePlacementTransform(imagePlacementSnapshot.id, updated, "Adjust visual overlay scale");
                            }}
                          />
                        </label>
                        <div className="hammer-source-card__actions">
                          <button
                            type="button"
                            onClick={() => {
                              updateImagePlacementTransform(imagePlacementSnapshot.id, () => DEFAULT_IMAGE_PLACEMENT_TRANSFORM);
                              commitImagePlacementTransform(
                                imagePlacementSnapshot.id,
                                DEFAULT_IMAGE_PLACEMENT_TRANSFORM,
                                "Center visual overlay",
                              );
                            }}
                          >
                            Center
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="hammer-tool-hint">
                        Select an image clip in the timeline to open inspector controls.
                      </div>
                    )}
                  </section>
  </div>;
}
