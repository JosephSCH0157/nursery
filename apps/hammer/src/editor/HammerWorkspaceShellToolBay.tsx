import type { JSX } from "react";
import HammerBrollSelectionControls from "./HammerBrollSelectionControls";
import type { HammerToolBayRouteDecision } from "./hammerToolBayRouteDecision";
import { HammerTypedPassCompletionHeader, HammerTypedToolBayBody } from "./HammerTypedToolBaySurfaces";
import type { HammerToolBayRuntimeContexts } from "./hammerToolBayRuntimeContext";
export type HammerWorkspaceShellToolBayVM = {
  passLabel: string;
  passStatus: string;
  onMarkComplete: () => void;
  activeVisualTool?: "polish" | "images" | "broll";
  onSelectVisualTool?: (nextTool: "polish" | "images" | "broll") => void;
  routeDecision?: HammerToolBayRouteDecision;
};
export type PackagingIntroStatusView = {
  selectionStatusLine: string;
  placementStatusLine: string;
  applyActionLabel: string;
  removeActionLabel: string;
  canApply: boolean;
  canRemove: boolean;
};

export function derivePackagingIntroStatusView(args: {
  selectedIntroAssetId: string | null;
  selectedIntroPath: string | null;
  introPlaced: boolean;
}): PackagingIntroStatusView {
  const hasSelection = Boolean(args.selectedIntroAssetId);
  const hasResolvedSelection = Boolean(args.selectedIntroAssetId && args.selectedIntroPath);
  const selectedSourceLine = hasSelection
    ? (hasResolvedSelection
      ? `Selected intro from Source Desk: ${args.selectedIntroPath}`
      : `Selected intro from Source Desk is unresolved (${args.selectedIntroAssetId}).`)
    : "No intro selected in Source Desk.";
  const placementLine = args.introPlaced
    ? "Timeline packaging intro: placed."
    : "Timeline packaging intro: not placed.";
  return {
    selectionStatusLine: selectedSourceLine,
    placementStatusLine: placementLine,
    applyActionLabel: "Apply Selected Intro to Timeline",
    removeActionLabel: "Remove Intro from Timeline",
    canApply: hasResolvedSelection,
    canRemove: args.introPlaced,
  };
}

export default function HammerWorkspaceShellToolBay(p: { vm: HammerWorkspaceShellToolBayVM; runtimeContexts: HammerToolBayRuntimeContexts }): JSX.Element {
  const vm = p.vm;

  const ctx = vm as any;
  const props = ctx.shellProps as any;
  const addMinimalTransition = ctx.addMinimalTransition as any;
  const boundAttentionQueue = ctx.boundAttentionQueue as any;
  const boundAttentionSummary = ctx.boundAttentionSummary as any;
  const discardHearthBrollSuggestion = ctx.discardHearthBrollSuggestion as any;
  const editableVisualPlacements = ctx.editableVisualPlacements as any;
  const focusBoundAttentionOperation = ctx.focusBoundAttentionOperation as any;
  const moveResolvedBrollBinding = ctx.moveResolvedBrollBinding as any;
  const navigateBoundAttention = ctx.navigateBoundAttention as any;
  const outputSelectionSummary = ctx.outputSelectionSummary as any;
  const previewTruthPosture = ctx.previewTruthPosture as any;
  const releasePrepOpenHref = ctx.releasePrepOpenHref as any;
  const removeVisualPlacement = ctx.removeVisualPlacement as any;
  const replaceResolvedBrollBinding = ctx.replaceResolvedBrollBinding as any;
  const resolvedBrollBindingItems = ctx.resolvedBrollBindingItems as any;
  const resolveHearthBrollSuggestion = ctx.resolveHearthBrollSuggestion as any;
  const revertResolvedBrollBinding = ctx.revertResolvedBrollBinding as any;
  const selectedBoundBrollInspectorState = ctx.selectedBoundBrollInspectorState as any;
  const selectedBoundBrollOperationId = ctx.selectedBoundBrollOperationId as any;
  const selectedImagePlacement = ctx.selectedImagePlacement as any;
  const selectedTransitionBoundObject = ctx.selectedTransitionBoundObject as any;
  const setTranscriptTimingHint = ctx.setTranscriptTimingHint as any;
  const setVideoSnapMode = ctx.setVideoSnapMode as any;
  const sourceBrollItems = ctx.sourceBrollItems as any;
  const trimResolvedBrollBinding = ctx.trimResolvedBrollBinding as any;
  const unresolvedBrollSuggestionItems = ctx.unresolvedBrollSuggestionItems as any;
  const videoSnapMode = ctx.videoSnapMode as any;
  const viewingModeSummary = ctx.viewingModeSummary as any;
  const workspaceFocusMode = ctx.workspaceFocusMode as any;


  const activeTool = ctx.activeTool as string;
  const activeVisualTool = (ctx.activeVisualTool ?? vm.activeVisualTool ?? "polish") as "polish" | "images" | "broll";
  const onSelectVisualTool = (ctx.onSelectVisualTool ?? vm.onSelectVisualTool ?? null) as ((nextTool: "polish" | "images" | "broll") => void) | null;
  const setFocusOverride = ctx.setFocusOverride as (mode: "auto" | "source-focus" | "tool-focus" | "time-focus") => void;
  const unsupportedRoute = p.runtimeContexts.body?.surface === "unsupported"; const activeSurface = vm.routeDecision?.status === "resolved" ? vm.routeDecision.surface : null;
  return (
    <>
      {p.runtimeContexts.completion ? <HammerTypedPassCompletionHeader context={p.runtimeContexts.completion} /> : <header className="hammer-bay-head">
        <strong>Tool Rack</strong>
        <span className="hammer-toolbay-live-marker">TOOLBAY FILE IS LIVE</span>
        <div className="hammer-pass-head">
          <span>{vm.passLabel}</span>
          <span className={`hammer-pass-badge hammer-pass-badge--${vm.passStatus}`}>
            {vm.passStatus}
          </span>
          {!unsupportedRoute ? <button type="button" onClick={vm.onMarkComplete}>
            Mark Complete
          </button> : null}
        </div>
      </header>}
      <div className="hammer-bay-body" data-hammer-routed-surface={activeSurface}>
        {p.runtimeContexts.body ? <HammerTypedToolBayBody context={p.runtimeContexts.body} /> : <>
        {activeTool === "video" ? (
          <section className="hammer-tool-card hammer-visual-tool-selector" aria-label="Visual tool selector">
            <header className="hammer-tool-card__head">Visual Tools</header>
            <div className="hammer-source-card__actions" aria-label="Visual tools">
              <button
                type="button"
                className={activeVisualTool === "polish" ? "is-selected" : ""}
                onClick={() => onSelectVisualTool?.("polish")}
              >
                Polish
              </button>
              <button
                type="button"
                className={activeVisualTool === "images" ? "is-selected" : ""}
                onClick={() => onSelectVisualTool?.("images")}
              >
                Images
              </button>
              <button
                type="button"
                className={activeVisualTool === "broll" ? "is-selected" : ""}
                onClick={() => onSelectVisualTool?.("broll")}
              >
                B-roll
              </button>
            </div>
          </section>
        ) : null}
              {activeTool === "video" ? (
                activeVisualTool === "broll" ? (
                  <section className="hammer-tool-card">
                    <HammerBrollSelectionControls placement={selectedImagePlacement} onRemove={removeVisualPlacement} />
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
                  <div className="hammer-tool-hint">Placed visuals: {editableVisualPlacements?.placements.length ?? 0}</div>
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
                      {boundAttentionQueue.slice(0, 5).map((item: any) => (
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
                                (item: any) => item.assetPath && item.assetPath !== selectedBoundBrollInspectorState.assetRef,
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
                              const candidate = sourceBrollItems.find((item: any) => item.assetPath)?.assetPath ?? null;
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
              ) : null
            ) : null}

              <div className="hammer-tool-state-grid">
                <div>Workspace mode: {workspaceFocusMode}</div>
                <div>Macro: {props.selectedMacroRecipeRef ?? "none"}</div>
                <div>Last run: {props.lastMacroRunRef ?? "none"}</div>
                <div>Viewing: {viewingModeSummary}</div>
                <div>Output source: {outputSelectionSummary}</div>
                <div>Release prep: {releasePrepOpenHref ? "available" : "unavailable"}</div>
                <div>Preview truth: {previewTruthPosture}</div>
              </div>
        </>}
      </div>
    </>
  );
}
