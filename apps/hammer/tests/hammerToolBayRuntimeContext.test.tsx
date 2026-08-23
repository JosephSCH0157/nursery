import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HammerTypedPassCompletionHeader, HammerTypedToolBayBody } from "../src/editor/HammerTypedToolBaySurfaces";
import { assembleHammerToolBayRuntimeContexts, HAMMER_MIGRATED_TOOL_BAY_SURFACES } from "../src/editor/hammerToolBayRuntimeContext";
import type { HammerToolBayRouteDecision } from "../src/editor/hammerToolBayRouteDecision";

const resolved: HammerToolBayRouteDecision = {
  status: "resolved", activeTool: "export", activeVisualTool: null, representativePass: "ready",
  editorMode: "transcript", source: "current_pass", navigationPermitted: false, selectionPreserved: true,
};
const unsupported: HammerToolBayRouteDecision = {
  status: "unsupported", reason: "surface_not_supported", selectedPlacementId: "placement:1",
  navigationPermitted: false, selectionPreserved: true,
};

function fixture(route: HammerToolBayRouteDecision = resolved, currentPass: "ready" | "packaging" = "ready") {
  const activity = { completion: 0, focus: 0, send: 0, history: 0, persistence: 0, selection: 0 };
  const markPassComplete = (): void => { activity.completion += 1; };
  const focusIssue = (): void => { activity.focus += 1; };
  const sendToQuench = (): void => { activity.send += 1; };
  const contexts = assembleHammerToolBayRuntimeContexts({
    route, currentPass, passLabel: "Ready", passStatus: "in_progress",
    readinessData: {
      summaryAreas: [{ id: "audio", label: "Audio Finalization", status: "complete" }],
      readinessLabel: "Ready for export", blockerCount: 0, reviewCount: 0,
      exportStatusLabel: "Current", sending: false, loading: false, blocked: false,
      sendLabel: "Send to Quench", handoffStatus: null,
    },
    exportData: {
      handoffAvailable: true, openHref: "/quench", exportStatusLabel: "Current",
      readinessLabel: "Ready for export", readinessStatus: "ready", blockerCount: 0, reviewCount: 0,
      outputSelectionSummary: "Raw transcript", previewTruthPosture: "authoritative",
      exportTruthPosture: "authoritative", handoffTruthPosture: "authoritative", unresolvedBrollCount: 0,
      blockingReasons: [], reviewReasons: [], captionSafetyState: "safe", captionSafetyLabel: "Safe",
      captionSummaryLine: "Current", captionSourceLabel: "canonical", captionSafetyDetail: "Ready",
      renderStatus: null, loading: false, sending: false, sendLabel: "Send to Quench",
      preparedPackage: null, exportTruthState: "current", staleReasons: [], handoffStatus: null,
      savedPackage: null, error: null,
    },
    markPassComplete, focusIssue, sendToQuench,
  });
  return { contexts, activity, commands: { markPassComplete, focusIssue, sendToQuench } };
}

test("runtime assembly locks four migrated surfaces and preserves callback identity with zero activity", () => {
  assert.deepEqual(HAMMER_MIGRATED_TOOL_BAY_SURFACES, ["unsupported", "release_readiness", "export", "pass_completion"]);
  const { contexts, activity, commands } = fixture();
  assert.equal(contexts.completion?.commands.markPassComplete, commands.markPassComplete);
  assert.equal(contexts.body?.surface, "release_readiness");
  if (contexts.body?.surface !== "release_readiness") assert.fail();
  assert.equal(contexts.body.commands.focusIssue, commands.focusIssue);
  assert.equal(contexts.body.commands.sendToQuench, commands.sendToQuench);
  assert.deepEqual(activity, { completion: 0, focus: 0, send: 0, history: 0, persistence: 0, selection: 0 });
});

test("readiness, export, and unsupported mount only typed markup and remain stable across rerenders", () => {
  const readiness = fixture();
  const exportFixture = fixture(resolved, "packaging");
  const unsupportedFixture = fixture(unsupported);
  const cases = [readiness, exportFixture, unsupportedFixture];
  const expected = ["release_readiness", "export", "unsupported"];
  for (let index = 0; index < cases.length; index += 1) {
    const body = cases[index].contexts.body;
    assert.ok(body);
    const first = renderToStaticMarkup(<HammerTypedToolBayBody context={body} />);
    const second = renderToStaticMarkup(<HammerTypedToolBayBody context={body} />);
    assert.equal(first, second);
    assert.match(first, new RegExp(`data-hammer-tool-bay-surface="${expected[index]}"`));
    assert.doesNotMatch(first, /hammer-visual-tool-selector|Transcript Cleanup/);
    assert.deepEqual(cases[index].activity, { completion: 0, focus: 0, send: 0, history: 0, persistence: 0, selection: 0 });
  }
});

test("missing migrated data fails closed and never produces a legacy body", () => {
  const base = fixture();
  const failed = assembleHammerToolBayRuntimeContexts({
    route: resolved, currentPass: "ready", passLabel: "Ready", passStatus: "in_progress",
    markPassComplete: base.commands.markPassComplete, readinessData: null, exportData: null,
    focusIssue: base.commands.focusIssue, sendToQuench: base.commands.sendToQuench,
  });
  assert.equal(failed.body?.surface, "unsupported");
  if (failed.body?.surface !== "unsupported") assert.fail();
  assert.equal(failed.body.data.reason, "required_data_missing");
  assert.deepEqual(Object.keys(failed.body.commands), []);
});

test("migrated and legacy switching is deterministic and mount-safe", () => {
  const legacyRoute: HammerToolBayRouteDecision = { ...resolved, activeTool: "audio", representativePass: "audio_finalization", editorMode: "assets" };
  const sequence = [fixture().contexts, fixture(resolved, "packaging").contexts, fixture(legacyRoute).contexts, fixture().contexts, fixture(unsupported).contexts];
  assert.deepEqual(sequence.map((item) => item.body?.surface ?? "legacy"), ["release_readiness", "export", "legacy", "release_readiness", "unsupported"]);
  for (const item of sequence) {
    if (item.completion) renderToStaticMarkup(<HammerTypedPassCompletionHeader context={item.completion} />);
    if (item.body) renderToStaticMarkup(<HammerTypedToolBayBody context={item.body} />);
  }
});
