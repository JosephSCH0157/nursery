import assert from "node:assert/strict";
import test from "node:test";
import {
  compareHammerToolBayRouteToLegacy,
  resolveHammerToolBayRoute,
  type HammerToolBayLegacyComparison,
  type HammerToolBayRouteDecision,
  type HammerToolBayRouteInput,
  type HammerToolBaySurface,
} from "../src/editor/hammerToolBayRouteDecision";
import type { HammerSelectedVisualContext, HammerSelectedVisualKind } from "../src/editor/hammerSelectedVisualContext";

const ALL_SURFACES: readonly HammerToolBaySurface[] = [
  "polish", "visual_polish", "images", "broll", "audio", "captions", "details", "finishing", "export",
];

function selected(kind: HammerSelectedVisualKind, placementId = `placement:${kind}`): HammerSelectedVisualContext {
  const image = kind === "image";
  return {
    status: "selected", placementId, clipId: placementId, assetId: `asset:${kind}`, laneId: "lane:visual",
    kind, preferredTool: image ? "images" : "broll", preferredPass: image ? "image_placement" : "image_animation",
    capabilities: {
      remove: true, retime: true, anchor: image, transform: image, animate: image,
      rebind: !image, replace: !image, revert: !image, transition: !image,
    },
  };
}

const NONE: HammerSelectedVisualContext = { status: "none" };

function input(overrides: Partial<HammerToolBayRouteInput> = {}): HammerToolBayRouteInput {
  return {
    selectedVisualContext: NONE,
    currentPass: "image_placement",
    editorMode: "images",
    activeTool: "video",
    activeVisualTool: "images",
    intent: "current_pass",
    lifecycleSettled: true,
    supportedSurfaces: ALL_SURFACES,
    ...overrides,
  };
}

function assertInvariants(decision: HammerToolBayRouteDecision, navigationPermitted: boolean): void {
  assert.equal(decision.navigationPermitted, navigationPermitted);
  assert.equal(decision.selectionPreserved, true);
}

test("explicit image, B-roll, and reference selection reveal their frozen preferred routes from every surface", () => {
  const currentTools = ["polish", "audio", "video", "captions", "details", "finishing", "export"] as const;
  for (const kind of ["image", "broll", "reference_clip"] as const) {
    for (const activeTool of currentTools) {
      const decision = resolveHammerToolBayRoute(input({
        selectedVisualContext: selected(kind), intent: "explicit_visual_selection", activeTool,
      }));
      assert.deepEqual(decision, {
        status: "resolved",
        activeTool: "video",
        activeVisualTool: kind === "image" ? "images" : "broll",
        representativePass: kind === "image" ? "image_placement" : "image_animation",
        editorMode: kind === "image" ? "images" : "broll",
        source: "explicit_selection",
        navigationPermitted: true,
        selectionPreserved: true,
      });
    }
  }
});

test("passive, hydration, and synchronization intent preserve selection without navigation on every visual surface", () => {
  for (const intent of ["passive_restoration", "hydration_restoration", "synchronization"] as const) {
    for (const activeVisualTool of ["polish", "images", "broll"] as const) {
      const decision = resolveHammerToolBayRoute(input({
        intent, activeVisualTool, selectedVisualContext: selected(activeVisualTool === "images" ? "image" : "broll"),
      }));
      assert.equal(decision.status, "preserve");
      assert.equal(decision.status === "preserve" && decision.reason, "passive_selection_preserved");
      assertInvariants(decision, false);
    }
  }
});

test("every nonvisual Tool Bay surface resolves under manual navigation without visual interference", () => {
  const cases = [
    ["polish", "transcript_cleanup"], ["audio", "audio_finalization"], ["captions", "image_placement"],
    ["details", "image_placement"], ["finishing", "packaging"], ["export", "ready"],
  ] as const;
  for (const [activeTool, representativePass] of cases) {
    const decision = resolveHammerToolBayRoute(input({
      intent: "manual_navigation",
      selectedVisualContext: selected("reference_clip"),
      manualSelection: { activeTool, activeVisualTool: null },
    }));
    assert.equal(decision.status, "resolved");
    if (decision.status !== "resolved") continue;
    assert.equal(decision.activeTool, activeTool);
    assert.equal(decision.activeVisualTool, null);
    assert.equal(decision.representativePass, representativePass);
    assert.equal(decision.source, "manual_navigation");
    assertInvariants(decision, true);
  }
});

test("manual visual navigation works without selection and only when compatible with a selection", () => {
  for (const activeVisualTool of ["polish", "images", "broll"] as const) {
    const withoutSelection = resolveHammerToolBayRoute(input({
      intent: "manual_navigation", manualSelection: { activeTool: "video", activeVisualTool },
    }));
    assert.equal(withoutSelection.status, "resolved");
    assertInvariants(withoutSelection, true);
  }
  const polishWithImage = resolveHammerToolBayRoute(input({
    intent: "manual_navigation", selectedVisualContext: selected("image"),
    manualSelection: { activeTool: "video", activeVisualTool: "polish" },
  }));
  const imagesWithImage = resolveHammerToolBayRoute(input({
    intent: "manual_navigation", selectedVisualContext: selected("image"),
    manualSelection: { activeTool: "video", activeVisualTool: "images" },
  }));
  const brollWithImage = resolveHammerToolBayRoute(input({
    intent: "manual_navigation", selectedVisualContext: selected("image"),
    manualSelection: { activeTool: "video", activeVisualTool: "broll" },
  }));
  assert.equal(polishWithImage.status, "resolved");
  assert.equal(imagesWithImage.status, "resolved");
  assert.deepEqual(brollWithImage, {
    status: "preserve", reason: "manual_visual_surface_incompatible",
    navigationPermitted: false, selectionPreserved: true,
  });
});

test("current-pass and editor-mode routing resolves every canonical pass without navigation", () => {
  const cases = [
    ["transcript_cleanup", "transcript", "polish", null],
    ["retakes", "transcript", "polish", null],
    ["gap_pacing", "transcript", "polish", null],
    ["visual_finishing", "images", "video", "polish"],
    ["image_placement", "images", "video", "images"],
    ["image_animation", "broll", "video", "broll"],
    ["audio_finalization", "assets", "audio", null],
    ["packaging", "intro_outro", "finishing", null],
    ["ready", "transcript", "export", null],
  ] as const;
  for (const intent of ["current_pass", "editor_mode"] as const) {
    for (const [currentPass, editorMode, activeTool, activeVisualTool] of cases) {
      const decision = resolveHammerToolBayRoute(input({ currentPass, editorMode, activeTool, activeVisualTool, intent }));
      assert.equal(decision.status, "resolved");
      assert.equal(decision.status === "resolved" && decision.source, intent);
      assert.equal(decision.status === "resolved" && decision.representativePass, currentPass);
      assertInvariants(decision, false);
    }
  }
});

test("pass disagreement, missing fields, unknown fields, and unsupported surfaces fail closed", () => {
  const cases: Array<[Partial<HammerToolBayRouteInput>, string]> = [
    [{ currentPass: "audio_finalization", editorMode: "images", activeTool: "video" }, "pass_mode_disagreement"],
    [{ activeTool: null }, "active_tool_missing"],
    [{ activeTool: "mystery" }, "active_tool_unknown"],
    [{ activeVisualTool: null }, "active_visual_tool_unknown"],
    [{ activeVisualTool: "mystery" }, "active_visual_tool_unknown"],
    [{ currentPass: "future_pass" }, "current_pass_unknown"],
    [{ editorMode: "future_mode" }, "editor_mode_unknown"],
    [{ supportedSurfaces: ["audio"] }, "surface_not_supported"],
  ];
  for (const [overrides, reason] of cases) {
    const decision = resolveHammerToolBayRoute(input(overrides));
    assert.equal(decision.status, "unsupported");
    assert.equal(decision.status === "unsupported" && decision.reason, reason);
    assertInvariants(decision, false);
  }
});

test("none, stale identity, unsupported context, packaging restoration, and missing manual visual tool stay explicit", () => {
  const noExplicitSelection = resolveHammerToolBayRoute(input({ intent: "explicit_visual_selection" }));
  const stale = resolveHammerToolBayRoute(input({
    intent: "explicit_visual_selection",
    selectedVisualContext: { status: "unsupported", placementId: "placement:stale", reason: "absent" },
  }));
  const packagingRestore = resolveHammerToolBayRoute(input({
    intent: "hydration_restoration", currentPass: "packaging", editorMode: "intro_outro",
    activeTool: "finishing", activeVisualTool: null, selectedVisualContext: selected("broll"),
  }));
  const missingManualVisual = resolveHammerToolBayRoute(input({
    intent: "manual_navigation", manualSelection: { activeTool: "video", activeVisualTool: null },
  }));
  assert.equal(noExplicitSelection.status === "preserve" && noExplicitSelection.reason, "explicit_selection_missing");
  assert.equal(stale.status === "unsupported" && stale.reason, "selected_visual_unsupported");
  assert.equal(stale.status === "unsupported" && stale.selectedPlacementId, "placement:stale");
  assert.equal(packagingRestore.status === "preserve" && packagingRestore.reason, "passive_selection_preserved");
  assert.equal(missingManualVisual.status === "preserve" && missingManualVisual.reason, "manual_visual_tool_missing");
});

test("incomplete hydration preserves transitional disagreement while settled invalid state fails closed", () => {
  const transitional = input({
    intent: "hydration_restoration", lifecycleSettled: false,
    selectedVisualContext: { status: "unsupported", placementId: "placement:loading", reason: "timeline pending" },
    currentPass: "future_pending_pass", editorMode: "future_pending_mode", activeTool: null, activeVisualTool: null,
  });
  const settled = { ...transitional, lifecycleSettled: true };
  assert.equal(resolveHammerToolBayRoute(transitional).status, "preserve");
  assert.equal(resolveHammerToolBayRoute(settled).status, "unsupported");
});

test("route decisions are stable across rerenders and accept data-only inputs with zero activity channels", () => {
  const routeInput = input({ intent: "explicit_visual_selection", selectedVisualContext: selected("broll") });
  const clone = JSON.parse(JSON.stringify(routeInput)) as HammerToolBayRouteInput;
  assert.deepEqual(resolveHammerToolBayRoute(routeInput), resolveHammerToolBayRoute(clone));
  assert.equal(Object.values(routeInput).some((value) => typeof value === "function"), false);
});

test("legacy comparison classifies every explained parity category with stable totals", () => {
  const cases: Array<[HammerToolBayRouteInput, HammerToolBayLegacyComparison["classification"], HammerToolBayLegacyComparison["legacyBehavior"]]> = [
    [input({ intent: "explicit_visual_selection", selectedVisualContext: selected("image") }), "exact_parity", "none"],
    [input({ intent: "explicit_visual_selection", selectedVisualContext: selected("broll") }), "exact_parity", "non_image_selection_to_broll"],
    [input({ intent: "explicit_visual_selection", selectedVisualContext: selected("reference_clip") }), "exact_parity", "non_image_selection_to_broll"],
    [input({ intent: "explicit_visual_selection", selectedVisualContext: { status: "unsupported", placementId: "p", reason: "unsupported" } }), "exact_parity", "unsupported_visual_mode_panel"],
    [input({ activeVisualTool: null }), "intentionally_fail_closed", "missing_active_visual_tool_to_polish"],
    [input({ intent: "manual_navigation", manualSelection: { activeTool: "video", activeVisualTool: null } }), "intentionally_fail_closed", "missing_active_visual_tool_to_polish"],
    [input({ activeTool: null }), "intentionally_fail_closed", "missing_or_unknown_route_to_polish"],
    [input({ activeTool: "future_tool" }), "intentionally_fail_closed", "missing_or_unknown_route_to_polish"],
    [input({ activeVisualTool: "future_visual" }), "intentionally_fail_closed", "missing_active_visual_tool_to_polish"],
    [input({ currentPass: "future_pass" }), "intentionally_fail_closed", "missing_or_unknown_route_to_polish"],
    [input({ editorMode: "future_mode" }), "intentionally_fail_closed", "missing_or_unknown_route_to_polish"],
    [input({ supportedSurfaces: ["audio"] }), "intentionally_fail_closed", "unsupported_surface_fallback"],
    [input({ currentPass: "audio_finalization", editorMode: "images", activeTool: "video" }), "requires_htb2b_decision", "pass_mode_fallback"],
    [input({ activeTool: "audio" }), "requires_htb2b_decision", "pass_mode_fallback"],
    [input({ activeVisualTool: "broll" }), "requires_htb2b_decision", "pass_mode_fallback"],
    [input({ intent: "manual_navigation", selectedVisualContext: selected("image"), manualSelection: { activeTool: "video", activeVisualTool: "broll" } }), "requires_htb2b_decision", "manual_incompatible_surface"],
    [input({ intent: "passive_restoration", selectedVisualContext: selected("image") }), "exact_parity", "none"],
    [input({ intent: "explicit_visual_selection" }), "exact_parity", "none"],
    [input({ intent: "manual_navigation", manualSelection: { activeTool: "video", activeVisualTool: "images" } }), "exact_parity", "none"],
    [input({ intent: "manual_navigation", manualSelection: { activeTool: "audio", activeVisualTool: null } }), "exact_parity", "none"],
  ];
  const totals = { exact_parity: 0, intentionally_fail_closed: 0, requires_htb2b_decision: 0 };
  for (const [routeInput, classification, legacyBehavior] of cases) {
    const comparison = compareHammerToolBayRouteToLegacy(routeInput, resolveHammerToolBayRoute(routeInput));
    assert.deepEqual(comparison, { classification, legacyBehavior });
    totals[comparison.classification] += 1;
  }
  assert.deepEqual(totals, { exact_parity: 8, intentionally_fail_closed: 8, requires_htb2b_decision: 4 });
});
