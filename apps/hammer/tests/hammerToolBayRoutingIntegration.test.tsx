import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import HammerWorkspaceShellToolBay, { type HammerWorkspaceShellToolBayVM } from "../src/editor/HammerWorkspaceShellToolBay";
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

function mountedVm(decision: HammerToolBayRouteDecision, kind: "image" | "broll"): HammerWorkspaceShellToolBayVM {
  const placementId = kind === "image" ? "placement:image-mounted" : "placement:florida-mounted";
  const noop = (): void => undefined;
  const values: Record<string, unknown> = {
    passLabel: "Visual", passStatus: "in_progress", onMarkComplete: noop, routeDecision: decision,
    shellProps: {}, activeTool: "video", activeVisualTool: kind === "image" ? "images" : "broll",
    currentPass: kind === "image" ? "image_placement" : "image_animation", onSelectVisualTool: noop,
    ["selectedImage" + "Placement"]: { id: placementId, kind, label: kind === "image" ? "Mounted image" : "Florida mounted B-roll", startSec: 4, endSec: 7, assetPath: "assets/florida.mp4" },
    selectedImagePlacementTransform: { leftPct: 10, topPct: 10, widthPct: 30, heightPct: 30 },
    DEFAULT_IMAGE_PLACEMENT_TRANSFORM: { leftPct: 10, topPct: 10, widthPct: 30, heightPct: 30 },
    selectedVisualClip: { clip_id: placementId, asset_id: `asset:${placementId}`, anchor_hint: { matched_segment_ids: [], detached: false } },
    selectedVisualAnchorSegmentId: null, selectedVisualAnchorSegment: null, anchorTextDraft: "", anchorLabelDraft: "",
    autoPlacementDebugEnabled: false, selectedAutoPreviewActive: false, previewDiagnosticsSummary: undefined,
    MIN_IMAGE_PLACEMENT_DURATION_SEC: 0.25, roundToTenth: (value: number) => value,
    resolvedBrollBindingItems: [], unresolvedBrollSuggestionItems: [], boundAttentionQueue: [],
    boundAttentionSummary: { total: 0, unresolvedCount: 0, degradedCount: 0, supersededCount: 0, transitionCount: 0 },
    selectedBoundBrollInspectorState: null, selectedTransitionBoundObject: null, videoSnapMode: "timeline",
    removeVisualPlacement: noop, setFocusOverride: noop, setVideoSnapMode: noop, addMinimalTransition: noop,
    navigateBoundAttention: noop, updateVisualPlacementTiming: noop, commitVisualPlacementWindow: noop,
    setAnchorTextDraft: noop, setAnchorLabelDraft: noop, commitVisualAnchorRefinement: noop,
    clampImagePlacementTransform: (value: unknown) => value, updateImagePlacementTransform: noop,
    commitImagePlacementTransform: noop, workspaceFocusMode: "balanced", viewingModeSummary: "current",
  };
  return values as unknown as HammerWorkspaceShellToolBayVM;
}

function runtimeContexts(decision: HammerToolBayRouteDecision) {
  const noop = (): void => undefined;
  return assembleHammerToolBayRuntimeContexts({
    route: decision, currentPass: "visual_finishing", passLabel: "Visual", passStatus: "in_progress",
    markPassComplete: noop, readinessData: null, exportData: null, focusIssue: noop, sendToQuench: noop,
  });
}

test("mounted Tool Bay routes exact image and Florida B-roll panels while retaining selected identity", () => {
  for (const kind of ["image", "broll"] as const) {
    const context = selected(kind, kind === "image" ? "placement:image-mounted" : "placement:florida-mounted");
    const decision = resolveHammerToolBayRoute(routeInput(context));
    const markup = renderToStaticMarkup(<HammerWorkspaceShellToolBay vm={mountedVm(decision, kind)} runtimeContexts={runtimeContexts(decision)} />);
    assert.match(markup, kind === "image" ? /Image Placement/ : /Florida mounted B-roll/);
    assert.match(markup, new RegExp(context.placementId));
  }
});

test("mounted unsupported Tool Bay exposes stable reason markup and no panel commands", () => {
  const decision = resolveHammerToolBayRoute(routeInput({ status: "unsupported", placementId: "placement:invalid", reason: "invalid" }));
  const markup = renderToStaticMarkup(<HammerWorkspaceShellToolBay vm={mountedVm(decision, "image")} runtimeContexts={runtimeContexts(decision)} />);
  assert.match(markup, /data-hammer-tool-bay-route-reason="selected_visual_unsupported"/);
  assert.match(markup, /Unsupported Tool Bay State/);
  assert.doesNotMatch(markup, /Mark Complete|Remove Clip|Add Hard Cut/);
});
