import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import HammerWorkspaceShellToolBay from "../src/editor/HammerWorkspaceShellToolBay";
import { applyHammerToolBayRouteDecision } from "../src/editor/hammerToolBayRouteApplication";
import {
  HAMMER_SUPPORTED_TOOL_BAY_SURFACES,
  resolveHammerToolBayRoute,
  type HammerToolBayRouteDecision,
  type HammerToolBayRouteInput,
  type HammerToolBayUnsupportedReason,
} from "../src/editor/hammerToolBayRouteDecision";
import type { HammerSelectedVisualContext, HammerSelectedVisualKind } from "../src/editor/hammerSelectedVisualContext";
import type { HammerPassId } from "../src/persistence/hammerPersistenceContract";
import type { HammerEditorMode } from "../src/editor/hammerWorkspaceShellCore";
import { assembleHammerToolBayRuntimeContexts } from "../src/editor/hammerToolBayRuntimeContext";

function selected(kind: HammerSelectedVisualKind, id: string): HammerSelectedVisualContext {
  const image = kind === "image";
  return {
    status: "selected", placementId: id, clipId: id, assetId: `asset:${id}`, laneId: "lane:visual", kind,
    preferredTool: image ? "images" : "broll", preferredPass: image ? "image_placement" : "image_animation",
    capabilities: { remove: true, retime: true, anchor: image, transform: image, animate: image, rebind: !image, replace: !image, revert: !image, transition: !image },
  };
}

function routeInput(context: HammerSelectedVisualContext, overrides: Partial<HammerToolBayRouteInput> = {}): HammerToolBayRouteInput {
  return {
    selectedVisualContext: context, currentPass: "visual_finishing", editorMode: "images",
    activeTool: "video", activeVisualTool: "polish", intent: "explicit_visual_selection",
    lifecycleSettled: true, supportedSurfaces: HAMMER_SUPPORTED_TOOL_BAY_SURFACES, ...overrides,
  };
}

function applyFixture(decision: HammerToolBayRouteDecision): {
  first: ReturnType<typeof applyHammerToolBayRouteDecision>;
  second: ReturnType<typeof applyHammerToolBayRouteDecision>;
  state: { pass: HammerPassId; mode: HammerEditorMode; unsupported: HammerToolBayUnsupportedReason | null };
  counts: { transitions: number; commands: number; history: number; persistence: number };
} {
  const state: { pass: HammerPassId; mode: HammerEditorMode; unsupported: HammerToolBayUnsupportedReason | null } = {
    pass: "visual_finishing", mode: "images", unsupported: null,
  };
  const counts = { transitions: 0, commands: 0, history: 0, persistence: 0 };
  const apply = () => applyHammerToolBayRouteDecision({
    decision, currentPass: state.pass, editorMode: state.mode, unsupportedReason: state.unsupported,
    setCurrentPass: (pass) => { counts.transitions += 1; state.pass = pass; },
    setEditorMode: (mode) => { counts.transitions += 1; state.mode = mode; },
    setUnsupportedReason: (reason) => { counts.transitions += 1; state.unsupported = reason; },
  });
  return { first: apply(), second: apply(), state, counts };
}

test("production route application covers explicit image, B-roll, reference, and Florida identity without commands or writes", () => {
  const cases = [
    ["image", "placement:image", "image_placement", "images"],
    ["broll", "placement:florida-broll", "image_animation", "broll"],
    ["reference_clip", "placement:reference", "image_animation", "broll"],
  ] as const;
  for (const [kind, id, expectedPass, expectedMode] of cases) {
    const context = selected(kind, id);
    const decision = resolveHammerToolBayRoute(routeInput(context));
    const applied = applyFixture(decision);
    assert.equal(decision.status === "resolved" && context.placementId, id);
    assert.equal(applied.state.pass, expectedPass);
    assert.equal(applied.state.mode, expectedMode);
    assert.deepEqual(applied.second, { passChanged: false, editorModeChanged: false, unsupportedChanged: false });
    assert.equal(applied.counts.commands, 0);
    assert.equal(applied.counts.history, 0);
    assert.equal(applied.counts.persistence, 0);
  }
});

test("passive, hydration, manual rejection, and unsupported application preserve selection and issue zero writes", () => {
  const context = selected("image", "placement:kept");
  const decisions = [
    resolveHammerToolBayRoute(routeInput(context, { intent: "passive_restoration", activeVisualTool: "broll" })),
    resolveHammerToolBayRoute(routeInput({ status: "unsupported", placementId: "placement:stale", reason: "loading" }, { intent: "hydration_restoration", lifecycleSettled: false })),
    resolveHammerToolBayRoute(routeInput(context, { intent: "manual_navigation", manualSelection: { activeTool: "video", activeVisualTool: "broll" } })),
    resolveHammerToolBayRoute(routeInput({ status: "unsupported", placementId: "placement:stale", reason: "invalid" })),
  ];
  assert.deepEqual(decisions.map((decision) => decision.status), ["preserve", "preserve", "preserve", "unsupported"]);
  for (const decision of decisions) {
    const applied = applyFixture(decision);
    assert.equal(decision.selectionPreserved, true);
    assert.equal(applied.counts.commands + applied.counts.history + applied.counts.persistence, 0);
  }
});

test("audio-adjustments route application preserves exact surface and is idempotent", () => {
  const decision = resolveHammerToolBayRoute(routeInput({ status: "none" }, {
    currentPass: "audio_finalization", editorMode: "assets", activeTool: "audio", activeVisualTool: null,
    intent: "manual_navigation", manualSelection: { activeTool: "audio", activeVisualTool: null, surface: "audio_adjustments" },
  }));
  assert.equal(decision.status, "resolved");
  if (decision.status !== "resolved") return;
  let surface: import("../src/editor/hammerToolBayRouteDecision").HammerToolBaySurface | null = "audio_finalization";
  let writes = 0;
  const apply = () => applyHammerToolBayRouteDecision({
    decision, currentPass: "audio_finalization", editorMode: "assets", unsupportedReason: null,
    currentSurface: surface, setCurrentPass: () => { writes += 1; }, setEditorMode: () => { writes += 1; },
    setUnsupportedReason: () => { writes += 1; }, setSurface: (next) => { writes += 1; surface = next; },
  });
  assert.equal(decision.surface, "audio_adjustments");
  assert.deepEqual(apply(), { passChanged: false, editorModeChanged: false, unsupportedChanged: false });
  assert.equal(surface, "audio_adjustments");
  assert.equal(writes, 1);
  apply();
  assert.equal(writes, 1);
});

function runtimeContexts(decision: HammerToolBayRouteDecision, kind: "image" | "broll" | "reference_clip") {
  const noop = (): void => undefined;
  const placementId = kind === "image" ? "placement:image-mounted" : kind === "broll" ? "placement:florida-mounted" : "placement:reference-mounted";
  const selectedVisualContext = decision.status === "unsupported"
    ? { status: "unsupported" as const, placementId, reason: "invalid" }
    : { status: "selected" as const, placementId, clipId: placementId, assetId: `asset:${placementId}`, laneId: "lane:visual", kind, preferredTool: kind === "image" ? "images" as const : "broll" as const, preferredPass: kind === "image" ? "image_placement" as const : "image_animation" as const, capabilities: { remove: true, retime: true, anchor: kind === "image", transform: kind === "image", animate: kind === "image", rebind: kind !== "image", replace: kind !== "image", revert: kind !== "image", transition: kind !== "image" } };
  const imageInspectorData = selectedVisualContext.status === "selected" && kind === "image" ? {
    selectedVisual: selectedVisualContext, placementId, placement: { id: placementId, kind: "image" as const, label: "Mounted image", startSec: 4, endSec: 7, assetPath: "assets/florida.png", anchorSegmentId: "segment:1", anchorText: null, anchorLabel: null, status: "placed" as const, confidence: 1, visualMode: "image", firstVisibleEditableSec: 4, anchorStatus: "anchored" as const },
    transform: { leftPct: 10, topPct: 10, widthPct: 30, heightPct: 30 }, selectedClip: { clip_id: placementId, asset_id: `asset:${placementId}`, lane_id: "lane:visual", anchor_hint: { matched_segment_ids: [], detached: false } }, selectedAnchorSegment: null, selectedAnchorSegmentId: null, anchorTextDraft: "", anchorLabelDraft: "", autoPlacementDebugEnabled: false, selectedAutoPreviewActive: false, previewAutoPositionStatus: null,
    previewDiagnostics: { diagnosticsEnabled: false, resolvedPlacementExists: false, diagnosticsResolvedPlacement: false, candidateCount: 0, maskBoundsCount: 0, currentFrameAvailable: false, segmentationMaskAvailable: false, resolverStatus: "disabled", resolverReason: "disabled", selectedScale: null, scaleAttempts: [] },
    episodeHealth: { workspaceId: null, workpieceId: null, episodeId: null, recordingPath: null, playbackMediaPath: null, playbackMediaReady: false, visualPlacementsCount: 1, anchorCount: 0, selectedPlacementId: placementId, selectedClipId: placementId, selectedAssetId: `asset:${placementId}`, selectedOverlayAssetId: "assets/florida.png", frameInputAvailable: false, maskBoundsCount: 0, candidateCount: 0, selectedScale: null, resolvedPlacement: false, resolverStatus: "disabled", resolverReason: "disabled", diagnosticsEnabled: false, diagnosticsState: "disabled" },
  } : null;
  const brollReferenceData = selectedVisualContext.status === "selected" && kind !== "image" ? {
    selectedVisual: selectedVisualContext, placementId,
    placement: { id: placementId, kind, label: kind === "broll" ? "Florida mounted B-roll" : "Mounted reference clip", startSec: 4, endSec: 7 },
    selectedClip: { clip_id: placementId, asset_id: `asset:${placementId}`, lane_id: "lane:visual" }, placedVisualCount: 1,
    resolvedBrollBindingItems: [], unresolvedBrollSuggestionItems: [], boundAttentionQueue: [],
    boundAttentionSummary: { total: 0, unresolvedCount: 0, degradedCount: 0, supersededCount: 0, transitionCount: 0 },
    selectedBoundBrollInspectorState: null, selectedBoundBrollOperationId: null, selectedTransitionBoundObject: null,
    sourceBrollItems: [], videoSnapMode: "timeline" as const,
  } : null;
  return assembleHammerToolBayRuntimeContexts({
    route: decision, passLabel: "Visual", passStatus: "in_progress", selectedVisualContext, imageInspectorData, brollReferenceData, visualPolishData: null,
    markPassComplete: noop, readinessData: null, exportData: null, focusIssue: noop, sendToQuench: noop,
    visualPolishCommands: { updateLook: noop, updateExposure: noop, updateBackground: noop, toggleEyeContact: noop }, imageInspectorCommands: { focus: noop, previewAutoPosition: null, resetPreviewAutoPosition: null, setAnchorTextDraft: noop, setAnchorLabelDraft: noop, commitAnchor: noop, commitTiming: () => false, shiftTiming: noop, removePlacement: noop, updateTransformDraft: noop, commitTransform: () => false }, brollCommands: { removePlacement: noop, addMinimalTransition: noop, navigateBoundAttention: noop, focusBoundAttentionOperation: noop, moveResolvedBrollBinding: noop, trimResolvedBrollBinding: noop, replaceResolvedBrollBinding: noop, revertResolvedBrollBinding: noop, resolveHearthBrollSuggestion: noop, discardHearthBrollSuggestion: noop, setTranscriptTimingHint: noop, setVideoSnapMode: noop, setFocusOverride: noop }, referenceClipCommands: { removePlacement: noop, addMinimalTransition: noop, navigateBoundAttention: noop, focusBoundAttentionOperation: noop, moveResolvedBrollBinding: noop, trimResolvedBrollBinding: noop, replaceResolvedBrollBinding: noop, revertResolvedBrollBinding: noop, resolveHearthBrollSuggestion: noop, discardHearthBrollSuggestion: noop, setTranscriptTimingHint: noop, setVideoSnapMode: noop, setFocusOverride: noop },
    audioCommands: { updateVoicePreset: noop, toggleCompare: noop, applyPodcastMaster: noop }, captionCommands: { buildCaptions: noop, discardEdits: noop, editCaption: noop, splitCaption: noop, mergeCaption: noop }, metadataCommands: { setTags: noop }, transcriptCleanupCommands: { refreshCandidates: noop, previewCandidate: noop, acceptCandidate: noop, dismissCandidate: noop, applyCleanup: noop, discardCleanup: noop }, retakeCommands: { previewRange: noop, acceptRange: noop, dismissRange: noop }, gapCommands: { previewRange: noop, acceptRange: noop, dismissRange: noop }, transcriptPolishCommands: { previewCleanup: noop, applyCleanup: noop, discardCleanup: noop }, packagingCommands: { applyIntro: noop, removeIntro: noop, applyOutro: noop, removeOutro: noop, updateLogo: noop }, finishingCommands: { setReviewFlag: noop },
  });
}

test("mounted Tool Bay routes exact image, Florida B-roll, and reference panels while retaining selected identity", () => {
  for (const kind of ["image", "broll", "reference_clip"] as const) {
    const context = selected(kind, kind === "image" ? "placement:image-mounted" : kind === "broll" ? "placement:florida-mounted" : "placement:reference-mounted");
    const decision = resolveHammerToolBayRoute(routeInput(context));
    const markup = renderToStaticMarkup(<HammerWorkspaceShellToolBay contexts={runtimeContexts(decision, kind)} />);
    assert.match(markup, kind === "image" ? /Image Placement/ : kind === "broll" ? /Florida mounted B-roll/ : /placement:reference-mounted/);
    assert.match(markup, new RegExp(context.placementId));
  }
});

test("mounted unsupported Tool Bay exposes stable reason markup and no panel commands", () => {
  const decision = resolveHammerToolBayRoute(routeInput({ status: "unsupported", placementId: "placement:invalid", reason: "invalid" }));
  const markup = renderToStaticMarkup(<HammerWorkspaceShellToolBay contexts={runtimeContexts(decision, "image")} />);
  assert.match(markup, /data-hammer-tool-bay-route-reason="selected_visual_unsupported"/);
  assert.match(markup, /Unsupported Tool Bay State/);
  assert.doesNotMatch(markup, /Mark Complete|Remove Clip|Add Hard Cut/);
});
