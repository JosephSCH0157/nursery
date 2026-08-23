import assert from "node:assert/strict";
import test from "node:test";
import {
  HAMMER_TOOL_BAY_CONTEXT_SURFACES,
  buildHammerToolBayContext,
  type BrollCommands,
  type HammerToolBayContextBuildInput,
  type ImagePlacementCommands,
} from "../src/editor/hammerToolBayContext";
import type { HammerSelectedVisualContext } from "../src/editor/hammerSelectedVisualContext";
import type { HammerToolBayRouteDecision } from "../src/editor/hammerToolBayRouteDecision";

const noop = (): void => undefined;
const resolved: HammerToolBayRouteDecision = {
  status: "resolved", activeTool: "polish", activeVisualTool: null, representativePass: "transcript_cleanup",
  editorMode: "transcript", source: "current_pass", navigationPermitted: false, selectionPreserved: true,
};
const visualRoute: HammerToolBayRouteDecision = {
  status: "resolved", activeTool: "video", activeVisualTool: "images", representativePass: "image_placement",
  editorMode: "images", source: "explicit_selection", navigationPermitted: true, selectionPreserved: true,
};
const visualPolishRoute: HammerToolBayRouteDecision = { ...visualRoute, activeVisualTool: "polish", representativePass: "visual_finishing" };
const brollRoute: HammerToolBayRouteDecision = { ...visualRoute, activeVisualTool: "broll", representativePass: "image_animation", editorMode: "broll" };
const audioRoute: HammerToolBayRouteDecision = { ...resolved, activeTool: "audio", representativePass: "audio_finalization" };
const captionsRoute: HammerToolBayRouteDecision = { ...resolved, activeTool: "captions" };
const metadataRoute: HammerToolBayRouteDecision = { ...resolved, activeTool: "details" };
const packagingRoute: HammerToolBayRouteDecision = { ...resolved, activeTool: "finishing", representativePass: "packaging", editorMode: "intro_outro" };
const finishingRoute: HammerToolBayRouteDecision = { ...resolved, activeTool: "finishing" };
const exportRoute: HammerToolBayRouteDecision = { ...resolved, activeTool: "export", representativePass: "ready" };
function selected(kind: "image" | "broll" | "reference_clip", placementId: string): HammerSelectedVisualContext {
  const image = kind === "image";
  return {
    status: "selected", placementId, clipId: `clip:${placementId}`, assetId: `asset:${placementId}`, laneId: "lane:visual", kind,
    preferredTool: image ? "images" : "broll", preferredPass: image ? "image_placement" : "image_animation",
    capabilities: { remove: true, retime: true, anchor: image, transform: image, animate: image, rebind: !image, replace: !image, revert: !image, transition: !image },
  };
}

const transcriptCleanupCommands = { refreshCandidates: noop, previewCandidate: noop, acceptCandidate: noop, dismissCandidate: noop, applyCleanup: noop, discardCleanup: noop };
const retakeCommands = { previewRange: noop, acceptRange: noop, dismissRange: noop };
const transcriptPolishCommands = { previewCleanup: noop, applyCleanup: noop, discardCleanup: noop };
const visualPolishCommands = { updateLook: noop, updateExposure: noop, updateBackground: noop, toggleEyeContact: noop };
const imagePlacementCommands: ImagePlacementCommands = { removePlacement: noop, updateAnchor: noop };
const imageTimingCommands = { retimePlacement: noop };
const imageTransformCommands = { updateTransform: noop, resetTransform: noop };
const imageAnimationCommands = { updateAnimation: noop };
const brollCommands: BrollCommands = { removePlacement: noop, rebindPlacement: noop, replaceBinding: noop, revertBinding: noop, addTransition: noop };
const audioCommands = { updateVoicePreset: noop, toggleCompare: noop, applyPodcastMaster: noop };
const captionCommands = { buildCaptions: noop, discardEdits: noop, editCaption: noop, splitCaption: noop, mergeCaption: noop };
const packagingCommands = { applyIntro: noop, removeIntro: noop, applyOutro: noop, removeOutro: noop, updateLogo: noop };
const finishingCommands = { setReviewFlag: noop };
const releaseCommands = { focusIssue: noop, sendToQuench: noop };

const image = selected("image", "placement:image");
const broll = selected("broll", "placement:florida");
const reference = selected("reference_clip", "placement:reference");
const fixtures: readonly HammerToolBayContextBuildInput[] = [
  { surface: "transcript_cleanup", route: resolved, data: { selectedCandidateId: "candidate:1", candidateIds: ["candidate:1"], previewId: "preview:1" }, commands: transcriptCleanupCommands },
  { surface: "retakes", route: resolved, data: { selectedCandidateId: null, candidateIds: [] }, commands: retakeCommands },
  { surface: "gap_pacing", route: resolved, data: { selectedCandidateId: null, candidateIds: [] }, commands: retakeCommands },
  { surface: "transcript_polish", route: resolved, data: { previewId: null, selectedSegmentId: "segment:1" }, commands: transcriptPolishCommands },
  { surface: "visual_polish", route: visualPolishRoute, data: { selectedClipId: "clip:1", diagnosticsEnabled: true }, commands: visualPolishCommands },
  { surface: "image_placement", route: visualRoute, data: { selectedVisual: image, placementId: "placement:image", anchorSegmentId: "segment:1" }, commands: imagePlacementCommands },
  { surface: "image_timing", route: visualRoute, data: { selectedVisual: image, placementId: "placement:image", startSec: 1, endSec: 3 }, commands: imageTimingCommands },
  { surface: "image_transform", route: visualRoute, data: { selectedVisual: image, placementId: "placement:image", transform: { placementId: "placement:image", leftPct: 10, topPct: 10, widthPct: 30, heightPct: 30 } }, commands: imageTransformCommands },
  { surface: "image_animation", route: visualRoute, data: { selectedVisual: image, placementId: "placement:image", animation: "none" }, commands: imageAnimationCommands },
  { surface: "broll", route: brollRoute, data: { selectedVisual: broll, placementId: "placement:florida", bindingId: "binding:florida" }, commands: brollCommands },
  { surface: "reference_clip", route: brollRoute, data: { selectedVisual: reference, placementId: "placement:reference", bindingId: null }, commands: brollCommands },
  { surface: "audio_finalization", route: audioRoute, data: { presetId: "voice", compareEnabled: false, masterApplied: false }, commands: audioCommands },
  { surface: "audio_adjustments", route: audioRoute, data: { presetId: "voice", compareEnabled: false, rackEnabled: true }, commands: audioCommands },
  { surface: "captions", route: captionsRoute, data: { artifactId: "captions:1", captionIds: ["caption:1"], fresh: true }, commands: captionCommands },
  { surface: "metadata", route: metadataRoute, data: { tags: ["interview"] }, commands: { setTags: noop } },
  { surface: "packaging", route: packagingRoute, data: { introAssetId: null, outroAssetId: null, logoAssetId: null }, commands: packagingCommands },
  { surface: "finishing", route: finishingRoute, data: { transcriptReviewed: false, visualReviewed: false, audioReviewed: false }, commands: finishingCommands },
  { surface: "release_readiness", route: exportRoute, data: { issueIds: ["issue:1"], packageId: null, ready: false }, commands: releaseCommands },
  { surface: "export", route: exportRoute, data: { packageId: "package:1", outputIds: ["output:1"] }, commands: releaseCommands },
  { surface: "pass_completion", route: resolved, data: { passLabel: "Cleanup", complete: false }, commands: { markPassComplete: noop } },
];

test("every HTB-0 surface builds exactly one discriminated context with narrow data and commands", () => {
  assert.deepEqual(fixtures.map((fixture) => fixture.surface), HAMMER_TOOL_BAY_CONTEXT_SURFACES);
  for (const fixture of fixtures) {
    const context = buildHammerToolBayContext(fixture);
    if (context.surface === "unsupported") assert.fail(`unexpected unsupported ${context.data.reason}`);
    assert.equal(context.surface, fixture.surface);
    assert.equal(context.route, fixture.route);
    assert.equal(context.data, fixture.data);
    assert.equal(context.commands, fixture.commands);
  }
});

test("builders preserve callback and canonical target identity with zero activity", () => {
  const activity = { commands: 0, history: 0, persistence: 0 };
  const removePlacement = (_placementId: string): void => { activity.commands += 1; };
  const commands: ImagePlacementCommands = { removePlacement, updateAnchor: noop };
  const context = buildHammerToolBayContext({ surface: "image_placement", route: visualRoute, data: { selectedVisual: image, placementId: "placement:image", anchorSegmentId: null }, commands });
  assert.equal(context.surface, "image_placement");
  if (context.surface !== "image_placement") assert.fail();
  assert.equal(context.data.placementId, "placement:image");
  assert.equal(context.data.selectedVisual, image);
  assert.equal(context.commands.removePlacement, removePlacement);
  assert.deepEqual(activity, { commands: 0, history: 0, persistence: 0 });
});

test("surface command groups contain no unrelated callbacks", () => {
  const imageContext = buildHammerToolBayContext(fixtures[5]);
  const brollContext = buildHammerToolBayContext(fixtures[9]);
  const transcriptContext = buildHammerToolBayContext(fixtures[3]);
  assert.deepEqual(imageContext.surface === "image_placement" ? Object.keys(imageContext.commands).sort() : [], ["removePlacement", "updateAnchor"]);
  assert.deepEqual(brollContext.surface === "broll" ? Object.keys(brollContext.commands).sort() : [], ["addTransition", "rebindPlacement", "removePlacement", "replaceBinding", "revertBinding"]);
  assert.deepEqual(transcriptContext.surface === "transcript_polish" ? Object.keys(transcriptContext.commands).sort() : [], ["applyCleanup", "discardCleanup", "previewCleanup"]);
  assert.equal(imageContext.surface === "image_placement" && "rebindPlacement" in imageContext.commands, false);
  assert.equal(brollContext.surface === "broll" && "updateTransform" in brollContext.commands, false);
  assert.equal(transcriptContext.surface === "transcript_polish" && "removePlacement" in transcriptContext.commands, false);
});

test("unresolved routes, missing selection, identity mismatch, kind mismatch, and capability mismatch fail closed", () => {
  const preserve: HammerToolBayRouteDecision = { status: "preserve", reason: "passive_selection_preserved", navigationPermitted: false, selectionPreserved: true };
  const withoutTransform: HammerSelectedVisualContext = image.status === "selected" ? { ...image, capabilities: { ...image.capabilities, transform: false } } : image;
  const cases: HammerToolBayContextBuildInput[] = [
    { surface: "audio_finalization", route: audioRoute, data: null, commands: audioCommands },
    { surface: "audio_finalization", route: resolved, data: { presetId: "voice", compareEnabled: false, masterApplied: false }, commands: audioCommands },
    { surface: "image_placement", route: preserve, data: { selectedVisual: image, placementId: "placement:image", anchorSegmentId: null }, commands: imagePlacementCommands },
    { surface: "image_placement", route: visualRoute, data: { selectedVisual: { status: "none" }, placementId: "placement:image", anchorSegmentId: null }, commands: imagePlacementCommands },
    { surface: "image_placement", route: visualRoute, data: { selectedVisual: image, placementId: "placement:other", anchorSegmentId: null }, commands: imagePlacementCommands },
    { surface: "broll", route: brollRoute, data: { selectedVisual: image, placementId: "placement:image", bindingId: null }, commands: brollCommands },
    { surface: "image_transform", route: visualRoute, data: { selectedVisual: withoutTransform, placementId: "placement:image", transform: { placementId: "placement:image", leftPct: 0, topPct: 0, widthPct: 10, heightPct: 10 } }, commands: imageTransformCommands },
  ];
  assert.deepEqual(cases.map((fixture) => {
    const result = buildHammerToolBayContext(fixture);
    return result.surface === "unsupported" ? result.data.reason : "resolved";
  }), ["required_data_missing", "route_surface_mismatch", "route_not_resolved", "selected_visual_missing", "required_data_missing", "selected_visual_kind_mismatch", "selected_visual_capability_mismatch"]);
  for (const fixture of cases) {
    const result = buildHammerToolBayContext(fixture);
    assert.equal(result.surface, "unsupported");
    if (result.surface === "unsupported") assert.deepEqual(Object.keys(result.commands), []);
  }
});

test("equivalent cloned inputs are deterministic and inputs remain immutable", () => {
  const fixture: HammerToolBayContextBuildInput = { surface: "transcript_cleanup", route: resolved, data: { selectedCandidateId: "candidate:1", candidateIds: ["candidate:1"], previewId: "preview:1" }, commands: transcriptCleanupCommands };
  const before = structuredClone(fixture.data);
  const clone: HammerToolBayContextBuildInput = { ...fixture, data: structuredClone(fixture.data) };
  assert.deepEqual(buildHammerToolBayContext(fixture), buildHammerToolBayContext(clone));
  assert.deepEqual(fixture.data, before);
});

// Compile-time negative contracts: unrelated command groups cannot cross surface boundaries.
// @ts-expect-error Image placement cannot receive B-roll-only commands.
const invalidImageCommands: HammerToolBayContextBuildInput = { surface: "image_placement", route: visualRoute, data: { selectedVisual: image, placementId: "placement:image", anchorSegmentId: null }, commands: brollCommands };
// @ts-expect-error B-roll cannot receive image placement commands.
const invalidBrollCommands: HammerToolBayContextBuildInput = { surface: "broll", route: visualRoute, data: { selectedVisual: broll, placementId: "placement:florida", bindingId: null }, commands: imagePlacementCommands };
// @ts-expect-error Nonvisual surfaces cannot receive visual commands.
const invalidTranscriptCommands: HammerToolBayContextBuildInput = { surface: "transcript_polish", route: resolved, data: { previewId: null, selectedSegmentId: null }, commands: imagePlacementCommands };
void invalidImageCommands;
void invalidBrollCommands;
void invalidTranscriptCommands;
